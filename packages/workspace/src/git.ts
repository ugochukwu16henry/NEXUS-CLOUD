/**
 * Branch and commit rules (threat model T09). Nexus writes only to task branches: never to the
 * default branch, never to a protected one, and never with a force push.
 */

const TASK_BRANCH = /^task\/NX-(\d+)(-[a-z0-9-]+)?$/;

/** `task/NX-12-password-reset` for task 12, "Password reset!". */
export function taskBranchName(ref: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "") // drop accent marks: é → e, not e-
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug ? `task/NX-${ref}-${slug}` : `task/NX-${ref}`;
}

export type BranchCheck = { ok: true } | { ok: false; reason: string };

export function canWriteBranch(
  branch: string,
  repo: { defaultBranch: string; protectedBranches: readonly string[] },
): BranchCheck {
  if (branch === repo.defaultBranch) {
    return { ok: false, reason: `Nexus never writes to ${branch}; changes go to a task branch.` };
  }
  if (repo.protectedBranches.includes(branch)) {
    return { ok: false, reason: `${branch} is protected on GitHub.` };
  }
  if (!TASK_BRANCH.test(branch)) {
    return { ok: false, reason: "Only task branches (task/NX-…) can be written." };
  }
  return { ok: true };
}

/** `NX-12: Validate the email field` — first line at most 72 characters, task reference first. */
export function commitMessage(ref: number, summary: string, details = ""): string {
  const prefix = `NX-${ref}: `;
  const cleaned = summary
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^NX-\d+:\s*/i, "");
  const first = (prefix + (cleaned || "Update files")).slice(0, 72);
  const body = details.trim();
  return body ? `${first}\n\n${body}` : first;
}
