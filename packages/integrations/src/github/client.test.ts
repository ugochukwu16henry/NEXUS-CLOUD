import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { retryDelayMs, MAX_ATTEMPTS } from "../processor";
import { GitHubClient, GitHubError, SYNC_PERMISSIONS, summarizeChecks } from "./client";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that answers from a script and records every request. */
function scripted(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 500 };
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers,
    });
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const client = new GitHubClient({
    appId: "1",
    privateKey: pem,
    clientId: "Iv1.test",
    clientSecret: "client-secret-value",
    apiUrl: "https://api.github.test",
    webUrl: "https://github.test",
    fetch: fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, calls, sleeps };
}

describe("GitHub client", () => {
  it("mints a read-only installation token narrowed to one repository", async () => {
    const { client, calls } = scripted([
      { status: 201, body: { token: "ghs_installation", expires_at: "2026-11-04T10:00:00Z" } },
    ]);
    await expect(client.createInstallationToken(4242, { repositoryIds: [9001] })).resolves.toEqual({
      token: "ghs_installation",
      expiresAt: "2026-11-04T10:00:00Z",
    });
    expect(calls[0]!.url).toBe("https://api.github.test/app/installations/4242/access_tokens");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      repository_ids: [9001],
      permissions: SYNC_PERMISSIONS,
    });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/);
  });

  it("retries GitHub outages with backoff, then succeeds", async () => {
    const { client, calls, sleeps } = scripted([
      { status: 502 },
      { status: 503 },
      { status: 200, body: [{ name: "main", commit: { sha: "a".repeat(40) }, protected: true }] },
    ]);
    await expect(client.listBranches("ghs_token", "o/r")).resolves.toEqual([
      { name: "main", headSha: "a".repeat(40), protected: true },
    ]);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("honours Retry-After on a rate limit", async () => {
    const { client, sleeps } = scripted([
      { status: 429, headers: { "retry-after": "2" } },
      { status: 200, body: [] },
    ]);
    await client.listBranches("ghs_token", "o/r");
    expect(sleeps).toEqual([2000]);
  });

  it("gives up after three attempts with a clear, retryable error", async () => {
    const { client } = scripted([{ status: 503 }, { status: 503 }, { status: 503 }]);
    const error = await client.listBranches("ghs_token", "o/r").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ status: 503, retryable: true });
  });

  it("treats an exhausted rate limit (403) as retryable but other 403s as final", async () => {
    const limited = scripted([
      { status: 403, headers: { "x-ratelimit-remaining": "0" } },
      { status: 403, headers: { "x-ratelimit-remaining": "0" } },
      { status: 403, headers: { "x-ratelimit-remaining": "0" } },
    ]);
    await expect(limited.client.listBranches("t", "o/r")).rejects.toThrow("rate limited");

    const forbidden = scripted([{ status: 403, headers: { "x-ratelimit-remaining": "4000" } }]);
    await expect(forbidden.client.listBranches("t", "o/r")).rejects.toMatchObject({
      status: 403,
      retryable: false,
    });
    expect(forbidden.calls).toHaveLength(1);
  });

  it("never puts tokens or secrets in error messages", async () => {
    const { client } = scripted([{ status: 401, body: { message: "Bad credentials" } }]);
    const error = (await client
      .userInstallationIds("gho_user_secret_token")
      .catch((e) => e)) as Error;
    expect(error.message).not.toContain("gho_user_secret_token");

    const exchange = scripted([{ status: 200, body: { error: "bad_verification_code" } }]);
    const failed = (await exchange.client.exchangeCode("one-time-code").catch((e) => e)) as Error;
    expect(failed.message).not.toMatch(/client-secret-value|one-time-code/);
  });

  it("verifies installations through the user's own installation list", async () => {
    const { client, calls } = scripted([
      { status: 200, body: { installations: [{ id: 4242 }, { id: 7 }] } },
    ]);
    await expect(client.userInstallationIds("gho_user")).resolves.toEqual([4242, 7]);
    expect(calls[0]!.url).toBe("https://api.github.test/user/installations?per_page=100");
  });
});

describe("check summaries", () => {
  it.each([
    [[], "none"],
    [[{ status: "completed", conclusion: "success" }], "success"],
    [
      [
        { status: "completed", conclusion: "success" },
        { status: "queued", conclusion: null },
      ],
      "pending",
    ],
    [
      [
        { status: "queued", conclusion: null },
        { status: "completed", conclusion: "failure" },
      ],
      "failure",
    ],
  ])("%j → %s", (runs, summary) => {
    expect(summarizeChecks(runs)).toBe(summary);
  });
});

describe("webhook retry schedule", () => {
  it("backs off exponentially up to an hour, and gives up after five attempts", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(retryDelayMs(20)).toBe(3_600_000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
