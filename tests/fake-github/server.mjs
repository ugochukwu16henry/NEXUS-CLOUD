// A small stand-in for github.com and api.github.com, for E2E tests only. It implements the
// handful of endpoints Nexus calls, checks the GitHub App JWT against the public key of a key pair
// generated for this test run (never committed), and can simulate an outage.
//
// Control endpoints: POST /_fake/outage?count=N (next N API calls return 503), POST /_fake/reset,
// GET /_fake/token-requests (the scopes Nexus asked for), POST /_fake/advance?branch=B (someone
// else pushes to B), GET /_fake/health. Repository contents live in an in-memory Git store.
import { createVerify } from "node:crypto";
import { createServer } from "node:http";
import { createGitStore } from "./git-store.mjs";

const PORT = Number(process.env.FAKE_GITHUB_PORT ?? 3299);
const APP_URL = process.env.FAKE_GITHUB_APP_URL ?? "http://localhost:3100";
const PUBLIC_KEY = process.env.FAKE_GITHUB_PUBLIC_KEY ?? "";
const APP_ID = process.env.FAKE_GITHUB_APP_ID ?? "424242";
const CLIENT_SECRET = process.env.FAKE_GITHUB_CLIENT_SECRET ?? "";

export const INSTALLATION_ID = 4242;
const ACCOUNT = "nexus-test-org";
const REPO = {
  id: 9001,
  full_name: `${ACCOUNT}/nexus-pilot-app`,
  default_branch: "main",
  private: true,
  html_url: `https://github.com/${ACCOUNT}/nexus-pilot-app`,
};
const USER_TOKEN = "gho_fake_user_token";
const INSTALL_TOKEN = "ghs_fake_installation_token";

const git = createGitStore();
let outage = 0;
let tokenRequests = [];
const codes = new Set();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function validAppJwt(header) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const [h, p, s] = token.split(".");
  if (!h || !p || !s || !PUBLIC_KEY) return false;
  const ok = createVerify("RSA-SHA256")
    .update(`${h}.${p}`)
    .verify(PUBLIC_KEY, Buffer.from(s, "base64url"));
  if (!ok) return false;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  const now = Math.floor(Date.now() / 1000);
  return claims.iss === APP_ID && claims.exp > now && claims.exp - claims.iat <= 600;
}

const bearer = (req, token) => req.headers.authorization === `Bearer ${token}`;

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ---- control
  if (path === "/_fake/health") return send(res, 200, { ok: true });
  if (path === "/_fake/reset") {
    outage = 0;
    tokenRequests = [];
    git.reset();
    return send(res, 200, { ok: true });
  }
  if (path === "/_fake/outage") {
    outage = Number(url.searchParams.get("count") ?? 3);
    return send(res, 200, { outage });
  }
  if (path === "/_fake/token-requests") return send(res, 200, tokenRequests);
  if (path === "/_fake/advance") {
    git.advance(url.searchParams.get("branch") ?? "main");
    return send(res, 200, { ok: true });
  }
  if (path === "/_fake/branch-head") {
    return send(res, 200, { sha: git.refs.get(url.searchParams.get("branch") ?? "main") ?? null });
  }

  // ---- github.com (web)
  if (path === "/apps/nexus-test/installations/new") {
    // The owner "installs" the app; GitHub sends them back with a one-time code (OAuth on install).
    const code = `code-${Date.now()}`;
    codes.add(code);
    const back = new URL("/integrations/github/setup", APP_URL);
    back.searchParams.set("installation_id", String(INSTALLATION_ID));
    back.searchParams.set("setup_action", "install");
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (path === "/login/oauth/access_token" && req.method === "POST") {
    const body = await readJson(req);
    if (body.client_secret !== CLIENT_SECRET || !codes.delete(body.code)) {
      return send(res, 200, { error: "bad_verification_code" });
    }
    return send(res, 200, { access_token: USER_TOKEN, token_type: "bearer" });
  }

  // ---- api.github.com
  if (outage > 0) {
    outage -= 1;
    return send(res, 503, { message: "Service Unavailable" });
  }

  if (path === "/user/installations") {
    if (!bearer(req, USER_TOKEN)) return send(res, 401, { message: "Bad credentials" });
    return send(res, 200, { total_count: 1, installations: [{ id: INSTALLATION_ID }] });
  }
  if (path === `/app/installations/${INSTALLATION_ID}`) {
    if (!validAppJwt(req.headers.authorization)) return send(res, 401, { message: "Bad JWT" });
    return send(res, 200, {
      id: INSTALLATION_ID,
      account: { login: ACCOUNT, type: "Organization" },
      repository_selection: "selected",
      permissions: { metadata: "read", contents: "write", pull_requests: "write", checks: "read" },
      suspended_at: null,
    });
  }
  if (path === `/app/installations/${INSTALLATION_ID}/access_tokens` && req.method === "POST") {
    if (!validAppJwt(req.headers.authorization)) return send(res, 401, { message: "Bad JWT" });
    tokenRequests.push(await readJson(req));
    return send(res, 201, {
      token: INSTALL_TOKEN,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }

  if (!bearer(req, INSTALL_TOKEN)) return send(res, 401, { message: "Bad credentials" });

  if (path === "/installation/repositories") {
    return send(res, 200, { total_count: 1, repositories: [REPO] });
  }
  const base = `/repos/${REPO.full_name}`;
  if (path === `${base}/commits`) {
    const branch = url.searchParams.get("sha") ?? "main";
    return send(
      res,
      200,
      git.log(branch, Number(url.searchParams.get("per_page") ?? 30)).map((commit) => ({
        sha: commit.sha,
        html_url: `${REPO.html_url}/commit/${commit.sha}`,
        commit: { message: commit.message, author: { name: commit.author, date: commit.date } },
      })),
    );
  }
  if (path === `${base}/pulls` && req.method === "GET") {
    const head = git.refs.get("task/NX-1-login-form");
    return send(res, 200, [
      {
        number: 7,
        title: "Login form",
        state: "open",
        merged_at: null,
        html_url: `${REPO.html_url}/pull/7`,
        updated_at: "2026-11-04T09:00:00Z",
        head: { ref: "task/NX-1-login-form", sha: head },
        base: { ref: "main" },
      },
    ]);
  }
  if (path.startsWith(`${base}/commits/`) && path.endsWith("/check-runs")) {
    return send(res, 200, {
      total_count: 1,
      check_runs: [{ status: "completed", conclusion: "success" }],
    });
  }
  const body = ["POST", "PATCH"].includes(req.method) ? await readJson(req) : {};
  const handled = git.handle(req.method, path, body, REPO);
  if (handled) return send(res, handled.status, handled.body);
  return send(res, 404, { message: "Not Found" });
});

server.listen(PORT, () => console.log(`fake GitHub on http://localhost:${PORT}`));
