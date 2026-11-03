import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BranchMovedError,
  BranchNotWritableError,
  commitChanges,
  ensureTaskBranch,
  revertLatestCommit,
  type RepoTarget,
} from "./git-ops";
import { GitHubClient } from "./github/client";

// The same in-memory Git store the E2E fake GitHub uses, called in-process (no HTTP).
type Store = {
  reset(): void;
  advance(branch: string): void;
  handle(
    method: string,
    path: string,
    body: unknown,
    repo: unknown,
  ): { status: number; body: unknown } | null;
  refs: Map<string, string>;
  log(branch: string): { sha: string; message: string }[];
};
const storeModule = new URL("../../../tests/fake-github/git-store.mjs", import.meta.url).href;
const { createGitStore } = (await import(storeModule)) as { createGitStore: () => Store };

const REPO = { full_name: "nexus-test-org/nexus-pilot-app", html_url: "https://github.com/x/y" };
const target: RepoTarget = {
  fullName: REPO.full_name,
  defaultBranch: "main",
  protectedBranches: ["main"],
};
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

let store: Store;
let github: GitHubClient;
const token = "ghs_test";

beforeEach(() => {
  store = createGitStore();
  github = new GitHubClient({
    appId: "1",
    privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    clientId: "x",
    clientSecret: "y",
    apiUrl: "https://api.github.test",
    webUrl: "https://github.test",
    sleep: async () => {},
    fetch: (async (url: string, init: RequestInit) => {
      const { pathname } = new URL(url);
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const result = store.handle(init.method ?? "GET", pathname, body, REPO) ?? {
        status: 404,
        body: { message: "Not Found" },
      };
      return new Response(JSON.stringify(result.body), { status: result.status });
    }) as unknown as typeof fetch,
  });
});

const text = (value: string) => new TextEncoder().encode(value);

describe("writing to GitHub through the Git Data API (ADR 0017)", () => {
  it("creates a task branch from main the first time, then reuses it", async () => {
    const head = await ensureTaskBranch(github, token, target, "task/NX-2-signup");
    expect(head).toBe(store.refs.get("main"));
    expect(store.refs.get("task/NX-2-signup")).toBe(head);
    expect(await ensureTaskBranch(github, token, target, "task/NX-2-signup")).toBe(head);
  });

  it("commits added, changed, binary and deleted files as one commit on the task branch", async () => {
    const branch = "task/NX-1-login-form";
    const base = store.refs.get(branch)!;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2]);
    const sha = await commitChanges(github, token, target, {
      branch,
      baseSha: base,
      message: "NX-1: upload the site",
      files: [
        { path: "site/index.html", change: "add", content: text("<h1>Hi</h1>\n") },
        { path: "site/img/hero.png", change: "add", content: png },
        { path: "README.md", change: "modify", content: text("# Changed\n") },
        { path: "src/index.ts", change: "delete" },
      ],
    });
    expect(store.refs.get(branch)).toBe(sha);
    expect(store.log(branch)[0]!.message).toBe("NX-1: upload the site");
    expect(store.refs.get("main")).not.toBe(sha); // main untouched

    const tree = (
      await github.getTree(
        token,
        REPO.full_name,
        (await github.getCommit(token, REPO.full_name, sha)).treeSha,
      )
    ).map((entry) => entry.path);
    expect(tree).toEqual(
      expect.arrayContaining(["site/index.html", "site/img/hero.png", "README.md"]),
    );
    expect(tree).not.toContain("src/index.ts");
    const hero = (
      await github.getTree(
        token,
        REPO.full_name,
        (await github.getCommit(token, REPO.full_name, sha)).treeSha,
      )
    ).find((entry) => entry.path === "site/img/hero.png")!;
    expect([...(await github.getBlob(token, REPO.full_name, hero.sha))]).toEqual([...png]);
  });

  it("refuses to write when the branch moved since the edits started (no force push)", async () => {
    const branch = "task/NX-1-login-form";
    const base = store.refs.get(branch)!;
    store.advance(branch);
    const moved = store.refs.get(branch);
    await expect(
      commitChanges(github, token, target, {
        branch,
        baseSha: base,
        message: "NX-1: late",
        files: [{ path: "a.txt", change: "add", content: text("a") }],
      }),
    ).rejects.toBeInstanceOf(BranchMovedError);
    expect(store.refs.get(branch)).toBe(moved);
  });

  it.each(["main", "release", "feature/x"])("never writes to %s", async (branch) => {
    await expect(
      commitChanges(
        github,
        token,
        { ...target, protectedBranches: ["main", "release"] },
        {
          branch,
          baseSha: store.refs.get("main")!,
          message: "x",
          files: [{ path: "a.txt", change: "add", content: text("a") }],
        },
      ),
    ).rejects.toBeInstanceOf(BranchNotWritableError);
    expect(store.log("main")).toHaveLength(1);
  });

  it("reverts the latest commit with a new commit restoring the parent's files", async () => {
    const branch = "task/NX-1-login-form";
    const before = store.refs.get(branch)!;
    const committed = await commitChanges(github, token, target, {
      branch,
      baseSha: before,
      message: "NX-1: oops",
      files: [{ path: "oops.txt", change: "add", content: text("mistake") }],
    });
    const revert = await revertLatestCommit(github, token, target, {
      branch,
      expectedHead: committed,
    });
    expect(store.log(branch).map((c) => c.message)).toEqual([
      `Revert "NX-1: oops"\n\nThis reverts commit ${committed}.`,
      "NX-1: oops",
      "NX-1: add remember me",
      "Initial commit",
    ]);
    const [beforeTree, afterTree] = await Promise.all(
      [before, revert].map(
        async (sha) => (await github.getCommit(token, REPO.full_name, sha)).treeSha,
      ),
    );
    expect(afterTree).toBe(beforeTree);
  });

  it("won't revert a branch with nothing of its own", async () => {
    await ensureTaskBranch(github, token, target, "task/NX-3-empty");
    await expect(
      revertLatestCommit(github, token, target, {
        branch: "task/NX-3-empty",
        expectedHead: store.refs.get("main")!,
      }),
    ).rejects.toThrow("no commits of its own");
  });
});
