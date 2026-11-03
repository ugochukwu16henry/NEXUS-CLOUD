import { normalizePath } from "@nexus/workspace";

/**
 * Every command and write is checked here before it can run (threat model T12, T33).
 * Safe-list commands run. Destructive ones wait for the owner. A denylisted command,
 * a path outside the worktree, or a host outside the allowlist is refused.
 */

export type ApprovalMode = "ask" | "safe_list" | "custom";

export type PolicyDecision =
  { effect: "allow" } | { effect: "approve"; reason: string } | { effect: "deny"; reason: string };

/** Package registry and GitHub. Anything else is refused, not merely asked about. */
export const DEFAULT_ALLOWLIST = ["github.com", "registry.npmjs.org", "registry.npmmirror.com"];

const SAFE = new Set([
  "pnpm install",
  "pnpm test",
  "pnpm run lint",
  "pnpm run build",
  "pnpm exec tsc --noEmit",
  "npm test",
  "npm run lint",
  "npm run build",
  "git status",
  "git diff",
  "git log",
  "git show",
  "ls",
  "pwd",
]);

/** Refused outright. Approval cannot override these. */
const DENY_BIN =
  /^(?:sudo|env|printenv|export|chmod|chown|dd|mkfs|mount|umount|nsenter|docker|ssh|scp|nc|ncat)\b/;

const HOST =
  /\b(?:https?:\/\/)?([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+)\b/gi;

export function normaliseCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

/** A file name looks like a host name; these endings are files, not hosts. */
const FILE_EXTENSIONS = new Set(
  "ts tsx mts cts js jsx mjs cjs json md mdx txt css scss html yml yaml toml lock sh py rb go rs sql env svg png log".split(
    " ",
  ),
);

function hostsIn(command: string): string[] {
  const found = new Set<string>();
  for (const match of command.matchAll(HOST)) {
    const host = match[1]?.toLowerCase();
    if (!host) continue;
    if (FILE_EXTENSIONS.has(host.split(".").at(-1) ?? "")) continue;
    found.add(host);
  }
  return [...found];
}

export function decideCommand(
  raw: string,
  options: { mode: ApprovalMode; custom?: readonly string[]; allowlist?: readonly string[] },
): PolicyDecision {
  const command = normaliseCommand(raw);
  if (!command) return { effect: "deny", reason: "empty command" };
  if (/[;&|`$<>\n]/.test(command) || command.includes("$(")) {
    return { effect: "deny", reason: "shell operators are not allowed" };
  }
  if (DENY_BIN.test(command)) {
    return { effect: "deny", reason: "that command is on the denylist" };
  }
  const allow = new Set((options.allowlist ?? DEFAULT_ALLOWLIST).map((host) => host.toLowerCase()));
  const blocked = hostsIn(command).filter((host) => !allow.has(host));
  if (blocked.length > 0) {
    return { effect: "deny", reason: `network host not allowed: ${blocked[0]}` };
  }
  if (options.mode === "ask") {
    return { effect: "approve", reason: "approval mode asks for every command" };
  }
  if (options.mode === "custom") {
    const list = new Set((options.custom ?? []).map(normaliseCommand));
    if (list.has(command)) return { effect: "allow" };
    return { effect: "approve", reason: "not on the custom list" };
  }
  if (SAFE.has(command)) return { effect: "allow" };
  return { effect: "approve", reason: "not on the safe list" };
}

export function decideWrite(path: string): PolicyDecision {
  const normalized = normalizePath(path);
  if (!normalized.ok) return { effect: "deny", reason: normalized.reason };
  return { effect: "allow" };
}
