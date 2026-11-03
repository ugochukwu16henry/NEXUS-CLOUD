import { canWriteBranch } from "@nexus/workspace";
import { GitHubError, type GitHubClient } from "./github/client";

/**
 * Writing to a repository through GitHub's Git Data API (ADR 0017): no checkout, no force push,
 * and only task branches. The branch rules are checked here as well as by callers, so no path to
 * this code can write to the default or a protected branch.
 */

export type RepoTarget = {
  fullName: string;
  defaultBranch: string;
  protectedBranches: readonly string[];
};

export type ChangedFile = {
  path: string;
  change: "add" | "modify" | "delete";
  content?: Uint8Array;
};

/** The task branch moved since the change set was based on it (someone else pushed). */
export class BranchMovedError extends Error {
  constructor(readonly branch: string) {
    super(`${branch} changed on GitHub since these edits started`);
    this.name = "BranchMovedError";
  }
}

export class BranchNotWritableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BranchNotWritableError";
  }
}

function assertWritable(branch: string, repo: RepoTarget) {
  const check = canWriteBranch(branch, repo);
  if (!check.ok) throw new BranchNotWritableError(check.reason);
}

/** The task branch's head, creating the branch from the default branch the first time. */
export async function ensureTaskBranch(
  github: GitHubClient,
  token: string,
  repo: RepoTarget,
  branch: string,
): Promise<string> {
  assertWritable(branch, repo);
  const head = await github.getBranchHead(token, repo.fullName, branch);
  if (head) return head;
  const base = await github.getBranchHead(token, repo.fullName, repo.defaultBranch);
  if (!base) throw new GitHubError(`${repo.defaultBranch} not found`, 404, false);
  await github.createBranch(token, repo.fullName, branch, base);
  return base;
}

/** Runs async work a few at a time (GitHub's secondary rate limits dislike bursts). */
async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  }
  return results;
}

/**
 * Commits a change set on top of `baseSha`. If the branch is no longer at `baseSha`, nothing is
 * written and BranchMovedError tells the owner to refresh; GitHub's own fast-forward check backs
 * this up at the final ref update.
 */
export async function commitChanges(
  github: GitHubClient,
  token: string,
  repo: RepoTarget,
  input: { branch: string; baseSha: string; message: string; files: ChangedFile[] },
): Promise<string> {
  assertWritable(input.branch, repo);
  if (input.files.length === 0) throw new Error("Nothing to commit");

  const head = await github.getBranchHead(token, repo.fullName, input.branch);
  if (head !== input.baseSha) throw new BranchMovedError(input.branch);
  const { treeSha } = await github.getCommit(token, repo.fullName, head);

  const entries = await inBatches(input.files, 5, async (file) => ({
    path: file.path,
    sha:
      file.change === "delete"
        ? null
        : await github.createBlob(token, repo.fullName, file.content ?? new Uint8Array()),
  }));
  const tree = await github.createTree(token, repo.fullName, treeSha, entries);
  const commit = await github.createCommit(token, repo.fullName, {
    message: input.message,
    tree,
    parents: [head],
  });
  try {
    await github.updateBranch(token, repo.fullName, input.branch, commit);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422)
      throw new BranchMovedError(input.branch);
    throw error;
  }
  return commit;
}

/**
 * Reverts the latest commit on a task branch with a new commit whose tree is its parent's. Older
 * commits need a real merge and wait for the sandbox (Sprint 6).
 */
export async function revertLatestCommit(
  github: GitHubClient,
  token: string,
  repo: RepoTarget,
  input: { branch: string; expectedHead: string },
): Promise<string> {
  assertWritable(input.branch, repo);
  const head = await github.getBranchHead(token, repo.fullName, input.branch);
  if (head !== input.expectedHead) throw new BranchMovedError(input.branch);
  const defaultHead = await github.getBranchHead(token, repo.fullName, repo.defaultBranch);
  if (head === defaultHead) throw new Error("This branch has no commits of its own to revert");

  const commit = await github.getCommit(token, repo.fullName, head);
  if (commit.parents.length !== 1) throw new Error("Merge commits can't be reverted here yet");
  const parent = await github.getCommit(token, repo.fullName, commit.parents[0]!);
  const firstLine = commit.message.split("\n")[0] ?? "";
  const revert = await github.createCommit(token, repo.fullName, {
    message: `Revert "${firstLine}"\n\nThis reverts commit ${head}.`,
    tree: parent.treeSha,
    parents: [head],
  });
  try {
    await github.updateBranch(token, repo.fullName, input.branch, revert);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422)
      throw new BranchMovedError(input.branch);
    throw error;
  }
  return revert;
}
