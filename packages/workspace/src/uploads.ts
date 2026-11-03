import { normalizePath, skipReason } from "./paths";

/** Per-project upload rules (workspace_settings), with the defaults from the migration. */
export type UploadLimits = {
  maxFileMb: number;
  maxUploadMb: number;
  maxFiles: number;
  skipFolders: readonly string[];
};

export const DEFAULT_LIMITS: UploadLimits = {
  maxFileMb: 25,
  maxUploadMb: 200,
  maxFiles: 1000,
  skipFolders: ["node_modules", ".next", "dist", "build", "coverage", ".turbo", ".cache"],
};

const MB = 1024 * 1024;

export type PlannedFile = { path: string; size: number };
export type UploadPlan =
  | {
      ok: true;
      accepted: PlannedFile[];
      skipped: { path: string; reason: string }[];
      rejected: { path: string; reason: string }[];
    }
  | { ok: false; message: string };

/**
 * Decides which files of a drag-and-drop or folder upload may go ahead, before anything is
 * stored. Skipped files (node_modules, OS junk) are listed, not errors; bad names are rejected one
 * by one; limits on the whole upload refuse it with a message the owner can act on.
 */
export function planUpload(
  files: { path: string; size: number }[],
  limits: UploadLimits,
): UploadPlan {
  const accepted: PlannedFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const rejected: { path: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const normalized = normalizePath(file.path);
    if (!normalized.ok) {
      rejected.push({ path: file.path.slice(0, 300), reason: normalized.reason });
      continue;
    }
    const skip = skipReason(normalized.path, limits.skipFolders);
    if (skip) {
      skipped.push({ path: normalized.path, reason: skip });
      continue;
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      rejected.push({ path: normalized.path, reason: "unknown size" });
      continue;
    }
    if (file.size > limits.maxFileMb * MB) {
      rejected.push({ path: normalized.path, reason: `larger than ${limits.maxFileMb} MB` });
      continue;
    }
    const key = normalized.path.toLowerCase();
    if (seen.has(key)) {
      rejected.push({ path: normalized.path, reason: "appears twice" });
      continue;
    }
    seen.add(key);
    accepted.push({ path: normalized.path, size: file.size });
  }

  if (accepted.length > limits.maxFiles) {
    return {
      ok: false,
      message: `That's ${accepted.length} files; the limit is ${limits.maxFiles} per upload. Upload the folder in parts, or raise the limit in Workspace settings.`,
    };
  }
  const total = accepted.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.maxUploadMb * MB) {
    return {
      ok: false,
      message: `That's ${Math.ceil(total / MB)} MB; the limit is ${limits.maxUploadMb} MB per upload.`,
    };
  }
  return { ok: true, accepted, skipped, rejected };
}
