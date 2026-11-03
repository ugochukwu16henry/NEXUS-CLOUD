import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  SYNC_PERMISSIONS,
  WRITE_PERMISSIONS,
  type GitHubClient,
  type RepoTarget,
  type TreeEntry,
} from "@nexus/integrations";
import { DEFAULT_LIMITS, type UploadLimits } from "@nexus/workspace";
import { getGitHubApp } from "@/lib/github/app";
import { getProjectRepository, type ProjectRepository } from "@/lib/github/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server side of the code workspace (ADR 0017). Reads go through RLS as the signed-in owner;
 * file contents and change-set writes use the secret key after the action has authorised them.
 */

export const BUCKET = "workspace";
/** Files above this open read-only (the test plan's large-file rule). */
export const EDITABLE_LIMIT = 1024 * 1024;

export type Workspace = {
  repo: ProjectRepository;
  target: RepoTarget;
  github: GitHubClient;
  token: string;
};

/** The project's repository with a token for this request, narrowed to that one repository. */
export async function openWorkspace(
  projectId: string,
  access: "read" | "write",
): Promise<Workspace | null> {
  const app = getGitHubApp();
  const repo = await getProjectRepository(projectId);
  if (!app.configured || !repo || repo.integrations.status !== "active") return null;
  const { token } = await app.client.createInstallationToken(repo.integrations.installation_id, {
    repositoryIds: [repo.github_repo_id],
    permissions: access === "write" ? WRITE_PERMISSIONS : SYNC_PERMISSIONS,
  });
  const supabase = await createSupabaseServerClient();
  const { data: protectedRows } = await supabase
    .from("repo_branches")
    .select("name")
    .eq("repository_id", repo.id)
    .eq("protected", true);
  return {
    repo,
    github: app.client,
    token,
    target: {
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      protectedBranches: (protectedRows ?? []).map((row) => row.name),
    },
  };
}

export async function getWorkspaceLimits(projectId: string): Promise<
  UploadLimits & {
    attachmentMaxMb: number;
    attachmentKinds: string[];
    nodeMajor: number;
    installCommand: string;
    testCommand: string;
    buildCommand: string;
    startCommand: string;
    terminalIdleSeconds: number;
    terminalMaxSessions: number;
    approvalMode: string;
    customCommands: string[];
    agentMaxIterations: number;
    plainEnv: string;
  }
> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspace_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return {
    maxFileMb: data?.max_file_mb ?? DEFAULT_LIMITS.maxFileMb,
    maxUploadMb: data?.max_upload_mb ?? DEFAULT_LIMITS.maxUploadMb,
    maxFiles: data?.max_files ?? DEFAULT_LIMITS.maxFiles,
    skipFolders: data?.skip_folders ?? DEFAULT_LIMITS.skipFolders,
    attachmentMaxMb: data?.attachment_max_mb ?? 20,
    attachmentKinds: data?.attachment_kinds ?? ["image", "pdf", "text"],
    nodeMajor: data?.node_major ?? 24,
    installCommand: data?.install_command ?? "pnpm install",
    testCommand: data?.test_command ?? "pnpm test",
    buildCommand: data?.build_command ?? "pnpm build",
    startCommand: data?.start_command ?? "pnpm dev",
    terminalIdleSeconds: data?.terminal_idle_seconds ?? 900,
    terminalMaxSessions: data?.terminal_max_sessions ?? 3,
    approvalMode: data?.approval_mode ?? "safe_list",
    customCommands: data?.custom_commands ?? [],
    agentMaxIterations: data?.agent_max_iterations ?? 8,
    plainEnv: formatPlainEnv(data?.plain_env),
  };
}

function formatPlainEnv(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, item]) => `${key}=${item}`)
    .join("\n");
}

/** The task's open change set, if any (RLS: owner only). */
export async function getOpenChangeset(taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("changesets")
    .select(
      "id, project_id, repository_id, task_id, branch, base_sha, status, locked_by, locked_until, version",
    )
    .eq("task_id", taskId)
    .eq("status", "open")
    .maybeSingle();
  return data;
}

/** The branch this task already works on (from any earlier change set), so renames don't fork it. */
export async function getTaskBranch(taskId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("changesets")
    .select("branch")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.branch ?? null;
}

export async function listChangedFiles(changesetId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("changeset_files")
    .select("path, change, size_bytes, is_binary, held_reason, updated_at, storage_key")
    .eq("changeset_id", changesetId)
    .order("path");
  return data ?? [];
}

/** Files on a commit's tree (the explorer). */
export async function readTree(ws: Workspace, commitSha: string): Promise<TreeEntry[]> {
  const { treeSha } = await ws.github.getCommit(ws.token, ws.target.fullName, commitSha);
  return ws.github.getTree(ws.token, ws.target.fullName, treeSha);
}

/** A file's bytes at a commit, or null when it doesn't exist there. */
export async function readCommittedFile(
  ws: Workspace,
  commitSha: string,
  path: string,
): Promise<Uint8Array | null> {
  const entry = (await readTree(ws, commitSha)).find((item) => item.path === path);
  return entry ? ws.github.getBlob(ws.token, ws.target.fullName, entry.sha) : null;
}

export async function readStoredFile(storageKey: string): Promise<Uint8Array> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .download(storageKey);
  if (error || !data) throw new Error(`read ${storageKey}: ${error?.message ?? "missing"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Stores new file contents for a change set; returns the storage key. */
export async function storeFile(changesetId: string, bytes: Uint8Array): Promise<string> {
  const key = `${changesetId}/${randomUUID()}`;
  const { error } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .upload(key, bytes, { contentType: "application/octet-stream", upsert: false });
  if (error) throw new Error(`store file: ${error.message}`);
  return key;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
