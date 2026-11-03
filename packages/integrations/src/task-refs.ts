/**
 * Finds task references (NX-12) in branch names, commit messages and pull request titles, so work
 * on GitHub links back to the board. `task/NX-12-password-reset` and `NX-12: fix reset` both
 * mention task 12. Matching is case-insensitive and needs a word boundary, so `ANX-12` doesn't count.
 */
const TASK_REF = /(?<![A-Za-z0-9])nx-(\d{1,6})(?!\d)/gi;

export function parseTaskRefs(...texts: (string | null | undefined)[]): number[] {
  const refs = new Set<number>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TASK_REF)) {
      const ref = Number(match[1]);
      if (ref > 0) refs.add(ref);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

/** The branch name inside a Git ref: `refs/heads/task/NX-1` → `task/NX-1`; null for tags. */
export function branchFromRef(ref: string): string | null {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
}
