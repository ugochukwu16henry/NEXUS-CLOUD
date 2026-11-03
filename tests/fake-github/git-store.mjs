// An in-memory Git repository behind GitHub's Git Data API, for tests only (ADR 0017). Objects get
// real SHA-1 IDs computed the way Git does for blobs; trees are stored flat (path → blob), which is
// all the endpoints Nexus uses can tell apart.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const sha1 = (data) => createHash("sha1").update(data).digest("hex");
const blobSha = (bytes) => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));

/** The pilot repository's starting content: a tiny web app plus a logo, on main and a task branch. */
const SEED = {
  "README.md": "# Nexus pilot app\n\nA small app Nexus agents work on.\n",
  "package.json": '{\n  "name": "nexus-pilot-app",\n  "private": true\n}\n',
  "src/index.ts": "export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n",
  "src/login/form.ts": 'export const fields = ["email", "password"];\n',
};
// A 1×1 PNG, so binary files are part of every test.
const LOGO = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

export function createGitStore({ protectedBranches = ["main"] } = {}) {
  const blobs = new Map(); // sha -> Buffer
  const trees = new Map(); // sha -> Map(path -> blobSha)
  const commits = new Map(); // sha -> { tree, parents, message, author, date }
  const refs = new Map(); // branch -> commit sha
  const pulls = [];
  let clock = Date.parse("2026-11-01T09:00:00Z");

  const putBlob = (bytes) => {
    const sha = blobSha(bytes);
    blobs.set(sha, Buffer.from(bytes));
    return sha;
  };
  const putTree = (files) => {
    const sorted = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sha = sha1(`tree ${JSON.stringify(sorted)}`);
    trees.set(sha, new Map(sorted));
    return sha;
  };
  const putCommit = ({ tree, parents, message }) => {
    clock += 60_000;
    const date = new Date(clock).toISOString();
    const sha = sha1(`commit ${tree} ${parents.join(",")} ${message} ${date}`);
    commits.set(sha, { tree, parents, message, author: "Henry", date });
    return sha;
  };
  const commitFiles = (parent, changes, message) => {
    const files = new Map(parent ? trees.get(commits.get(parent).tree) : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) files.delete(path);
      else files.set(path, putBlob(Buffer.isBuffer(content) ? content : Buffer.from(content)));
    }
    return putCommit({ tree: putTree(files), parents: parent ? [parent] : [], message });
  };

  function reset() {
    for (const map of [blobs, trees, commits, refs]) map.clear();
    pulls.length = 0;
    const initial = commitFiles(null, { ...SEED, "public/logo.png": LOGO }, "Initial commit");
    refs.set("main", initial);
    refs.set(
      "task/NX-1-login-form",
      commitFiles(
        initial,
        { "src/login/form.ts": 'export const fields = ["email", "password", "remember"];\n' },
        "NX-1: add remember me",
      ),
    );
  }
  reset();

  /** Someone else pushes to a branch (to test "the branch moved"). */
  function advance(branch, message = "Pushed elsewhere") {
    refs.set(
      branch,
      commitFiles(refs.get(branch), { [`notes/${Date.now()}.md`]: "elsewhere\n" }, message),
    );
  }

  function log(branch, limit = 30) {
    const out = [];
    for (let sha = refs.get(branch); sha && out.length < limit; sha = commits.get(sha).parents[0]) {
      out.push({ sha, ...commits.get(sha) });
    }
    return out;
  }

  /** Handles one Git Data / repo request; returns { status, body } or null if not ours. */
  function handle(method, path, body, repo) {
    const base = `/repos/${repo.full_name}`;
    if (!path.startsWith(base)) return null;
    const rest = path.slice(base.length);

    if (method === "GET" && rest === "/branches") {
      return {
        status: 200,
        body: [...refs.entries()].map(([name, sha]) => ({
          name,
          commit: { sha },
          protected: protectedBranches.includes(name),
        })),
      };
    }
    if (method === "GET" && rest === "/commits") {
      return null; // query string handled by the caller
    }
    let m;
    if (method === "GET" && (m = rest.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = refs.get(decodeURIComponent(m[1]));
      return sha
        ? { status: 200, body: { ref: `refs/heads/${m[1]}`, object: { sha, type: "commit" } } }
        : { status: 404, body: { message: "Not Found" } };
    }
    if (method === "POST" && rest === "/git/refs") {
      const branch = String(body.ref).replace(/^refs\/heads\//, "");
      if (refs.has(branch)) return { status: 422, body: { message: "Reference already exists" } };
      if (!commits.has(body.sha))
        return { status: 422, body: { message: "Object does not exist" } };
      refs.set(branch, body.sha);
      return { status: 201, body: { ref: body.ref, object: { sha: body.sha } } };
    }
    if (method === "PATCH" && (m = rest.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const branch = decodeURIComponent(m[1]);
      const current = refs.get(branch);
      if (!current) return { status: 422, body: { message: "Reference does not exist" } };
      if (protectedBranches.includes(branch))
        return { status: 422, body: { message: "Protected branch" } };
      const next = commits.get(body.sha);
      if (!next) return { status: 422, body: { message: "Object does not exist" } };
      if (!body.force && !next.parents.includes(current)) {
        return { status: 422, body: { message: "Update is not a fast forward" } };
      }
      refs.set(branch, body.sha);
      return { status: 200, body: { object: { sha: body.sha } } };
    }
    if (method === "GET" && (m = rest.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
      const commit = commits.get(m[1]);
      if (!commit) return { status: 404, body: { message: "Not Found" } };
      return {
        status: 200,
        body: {
          sha: m[1],
          message: commit.message,
          tree: { sha: commit.tree },
          parents: commit.parents.map((sha) => ({ sha })),
        },
      };
    }
    if (method === "GET" && (m = rest.match(/^\/git\/trees\/([0-9a-f]{40})$/))) {
      const tree = trees.get(m[1]);
      if (!tree) return { status: 404, body: { message: "Not Found" } };
      return {
        status: 200,
        body: {
          sha: m[1],
          truncated: false,
          tree: [...tree.entries()].map(([p, sha]) => ({
            path: p,
            mode: "100644",
            type: "blob",
            sha,
            size: blobs.get(sha).length,
          })),
        },
      };
    }
    if (method === "GET" && (m = rest.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
      const blob = blobs.get(m[1]);
      if (!blob) return { status: 404, body: { message: "Not Found" } };
      return {
        status: 200,
        body: {
          sha: m[1],
          size: blob.length,
          encoding: "base64",
          content: blob.toString("base64"),
        },
      };
    }
    if (method === "POST" && rest === "/git/blobs") {
      const sha = putBlob(
        Buffer.from(body.content ?? "", body.encoding === "base64" ? "base64" : "utf8"),
      );
      return { status: 201, body: { sha } };
    }
    if (method === "POST" && rest === "/git/trees") {
      const baseTree = body.base_tree ? trees.get(body.base_tree) : new Map();
      if (!baseTree) return { status: 422, body: { message: "base_tree not found" } };
      const files = new Map(baseTree);
      for (const entry of body.tree ?? []) {
        if (entry.sha === null) files.delete(entry.path);
        else if (blobs.has(entry.sha)) files.set(entry.path, entry.sha);
        else return { status: 422, body: { message: `blob ${entry.sha} not found` } };
      }
      return { status: 201, body: { sha: putTree(files) } };
    }
    if (method === "POST" && rest === "/git/commits") {
      if (!trees.has(body.tree) || !(body.parents ?? []).every((p) => commits.has(p))) {
        return { status: 422, body: { message: "tree or parent not found" } };
      }
      return { status: 201, body: { sha: putCommit(body) } };
    }
    if (method === "POST" && rest === "/pulls") {
      if (!refs.has(body.head)) return { status: 422, body: { message: "head not found" } };
      const number = 7 + pulls.length + 1;
      pulls.push({ number, title: body.title, head: body.head, base: body.base });
      return { status: 201, body: { number, html_url: `${repo.html_url}/pull/${number}` } };
    }
    return null;
  }

  /** A gzipped tar of a commit, one top-level folder, as GET /repos/{repo}/tarball/{ref} returns. */
  function tarball(ref, folder) {
    const sha = refs.get(ref) ?? (commits.has(ref) ? ref : null);
    if (!sha) return null;
    const parts = [];
    for (const [path, blob] of trees.get(commits.get(sha).tree)) {
      const bytes = blobs.get(blob);
      const header = Buffer.alloc(512);
      header.write(`${folder}-${sha.slice(0, 7)}/${path}`.slice(0, 99), 0);
      header.write("0000644\0", 100);
      header.write("0000000\0", 108);
      header.write("0000000\0", 116);
      header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
      header.write("00000000000\0", 136);
      header.write("        ", 148);
      header.write("0", 156);
      header.write("ustar\0", 257);
      header.write("00", 263);
      let sum = 0;
      for (const byte of header) sum += byte;
      header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
      parts.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
    }
    parts.push(Buffer.alloc(1024));
    return gzipSync(Buffer.concat(parts));
  }

  return { reset, advance, log, handle, tarball, refs, pulls, commits, trees, blobs };
}
