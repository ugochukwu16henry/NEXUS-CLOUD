import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { normalizePath } from "@nexus/workspace";

/** Materialise a change set onto disk, and read back only files inside that directory. */

export type WorktreeFile = { path: string; text: string };

export function materialize(root: string, files: readonly WorktreeFile[]): void {
  const base = resolve(root);
  for (const file of files) {
    const target = resolveInside(base, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }
}

export function readWorktree(root: string): WorktreeFile[] {
  const base = resolve(root);
  const found: WorktreeFile[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const rel = full
        .slice(base.length + 1)
        .split(sep)
        .join("/");
      if (statSync(full).isDirectory()) walk(full);
      else found.push({ path: rel, text: readFileSync(full, "utf8") });
    }
  }
  walk(base);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveInside(root: string, path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.ok) throw new Error(normalized.reason);
  const target = resolve(root, normalized.path);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("path climbs out of the worktree");
  }
  return target;
}
