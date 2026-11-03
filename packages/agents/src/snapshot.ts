import { normalizePath, skipReason } from "@nexus/workspace";
import { sha256, type SandboxFile } from "./driver";

/**
 * A task's files in a sandbox: the repository at the change set's base commit, with the change
 * set's own edits on top. After a terminal session or an agent run, whatever differs from that
 * starting point goes back into the change set, the same rows a manual edit writes (ADR 0017).
 */

export type OverlayFile =
  | { path: string; change: "add" | "modify"; bytes: Uint8Array }
  | { path: string; change: "delete" };

export type Snapshot = {
  files: SandboxFile[];
  /** What the sandbox starts with: path -> sha256. */
  baseline: Map<string, string>;
  /** The repository at the base commit: path -> sha256. */
  repo: Map<string, string>;
  /** Repository files left out (skipped folder or too large); they are never synced back. */
  skipped: number;
};

export function buildSnapshot(input: {
  repoFiles: readonly SandboxFile[];
  overlay: readonly OverlayFile[];
  skipFolders: readonly string[];
  maxFileBytes: number;
}): Snapshot {
  const files = new Map<string, Uint8Array>();
  const repo = new Map<string, string>();
  let skipped = 0;
  for (const file of input.repoFiles) {
    const normalized = normalizePath(file.path);
    if (!normalized.ok) {
      skipped += 1;
      continue;
    }
    repo.set(normalized.path, sha256(file.bytes));
    if (skipReason(normalized.path, input.skipFolders) || file.bytes.length > input.maxFileBytes) {
      skipped += 1;
      continue;
    }
    files.set(normalized.path, file.bytes);
  }
  for (const file of input.overlay) {
    if (file.change === "delete") files.delete(file.path);
    else files.set(file.path, file.bytes);
  }
  const baseline = new Map<string, string>();
  for (const [path, bytes] of files) baseline.set(path, sha256(bytes));
  return {
    files: [...files].map(([path, bytes]) => ({ path, bytes })),
    baseline,
    repo,
    skipped,
  };
}

/**
 * What to write into the change set. `write`: new contents (add or modify, decided against the
 * repository); `delete`: a repository file removed; `revert`: back to the repository's version,
 * or an added file removed again, so the change set row goes.
 */
export type SyncChange =
  | { kind: "write"; path: string; change: "add" | "modify" }
  | { kind: "delete"; path: string }
  | { kind: "revert"; path: string };

export function diffSnapshot(
  snapshot: Pick<Snapshot, "baseline" | "repo">,
  current: ReadonlyMap<string, string>,
  skipFolders: readonly string[],
): SyncChange[] {
  const changes: SyncChange[] = [];
  for (const [path, hash] of current) {
    if (snapshot.baseline.get(path) === hash) continue;
    const normalized = normalizePath(path);
    if (!normalized.ok || skipReason(path, skipFolders)) continue;
    const original = snapshot.repo.get(path);
    if (original === hash) changes.push({ kind: "revert", path });
    else changes.push({ kind: "write", path, change: original ? "modify" : "add" });
  }
  for (const path of snapshot.baseline.keys()) {
    if (current.has(path)) continue;
    changes.push(snapshot.repo.has(path) ? { kind: "delete", path } : { kind: "revert", path });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
