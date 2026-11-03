/**
 * The path guard (threat model T09, T31). Every path that enters a change set, from the editor or
 * an upload, passes through here. A path is relative, uses forward slashes, and can never climb
 * out of the repository, touch `.git`, or carry control characters.
 */

export type PathResult = { ok: true; path: string } | { ok: false; reason: string };

const MAX_PATH = 300;
const MAX_SEGMENT = 255;

export function normalizePath(input: string): PathResult {
  if (typeof input !== "string" || input.length === 0) return { ok: false, reason: "empty name" };
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we reject
  if (/[\u0000-\u001f\u007f]/.test(input)) return { ok: false, reason: "control characters" };
  const slashed = input.replaceAll("\\", "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed) || slashed.startsWith("//")) {
    return { ok: false, reason: "absolute path" };
  }
  const segments = slashed.split("/").filter((segment, index) => !(segment === "." && index === 0));
  if (segments.some((segment) => segment === "")) return { ok: false, reason: "empty folder name" };
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { ok: false, reason: "path climbs out of the repository" };
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    return { ok: false, reason: "git internals" };
  }
  if (segments.some((segment) => segment.length > MAX_SEGMENT)) {
    return { ok: false, reason: "name too long" };
  }
  const path = segments.join("/");
  if (path.length > MAX_PATH) return { ok: false, reason: "path too long" };
  return { ok: true, path };
}

/** Files the OS or tools create on their own; never worth uploading. */
const JUNK_FILES = new Set([".ds_store", "thumbs.db", "desktop.ini", "ehthumbs.db"]);
const JUNK_FOLDERS = new Set(["__macosx", ".git"]);

/**
 * Whether an upload should be skipped (not rejected): dependency and build folders from the
 * project's settings, plus OS junk. Matching is by whole folder name, at any depth.
 */
export function skipReason(path: string, skipFolders: readonly string[]): string | null {
  const segments = path.split("/");
  const file = segments.at(-1)!.toLowerCase();
  if (JUNK_FILES.has(file)) return "system file";
  const folders = segments.slice(0, -1).map((segment) => segment.toLowerCase());
  if (folders.some((folder) => JUNK_FOLDERS.has(folder))) return "system folder";
  const skip = new Set(skipFolders.map((folder) => folder.toLowerCase()));
  const hit = folders.find((folder) => skip.has(folder));
  return hit ? `${hit} is skipped` : null;
}

/** A file name safe to show and store as an attachment name (no folders, no control characters). */
export function attachmentName(input: string): string {
  const base = input.replaceAll("\\", "/").split("/").at(-1) ?? "";
  // Control characters are stripped with \p{Cc} (no-control-regex flags the literal range form).
  const clean = base
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, 255);
  return clean.length > 0 && clean !== "." && clean !== ".." ? clean : "file";
}
