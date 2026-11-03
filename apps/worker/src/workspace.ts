import { randomUUID } from "node:crypto";
import {
  buildSnapshot,
  diffSnapshot,
  readTar,
  sha256,
  type OverlayFile,
  type SandboxFile,
  type SandboxSession,
  type Snapshot,
} from "@nexus/agents";
import type { Database } from "@nexus/db";
import { GitHubClient, SYNC_PERMISSIONS, normalizePrivateKey } from "@nexus/integrations";
import { DEFAULT_LIMITS, isBinary, scanForSecrets } from "@nexus/workspace";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;
type Settings = Database["public"]["Tables"]["workspace_settings"]["Row"];

const BUCKET = "workspace";

/**
 * A task's files for a sandbox, and the way back (ADR 0017, 0019): the repository at the change
 * set's base commit plus the change set's own edits go in; whatever the shell or the agent changed
 * comes back as change-set rows, held back from commits when it looks like a secret.
 */

export type TaskWorkspace = {
  settings: {
    nodeMajor: number;
    skipFolders: string[];
    maxFileBytes: number;
    testCommand: string;
    approvalMode: Settings["approval_mode"];
    customCommands: string[];
    plainEnv: Record<string, string>;
    terminalIdleSeconds: number;
    terminalMaxSessions: number;
    agentMaxIterations: number;
  };
  changeset: { id: string; baseSha: string } | null;
  snapshot: Snapshot;
};

function plainEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function gitHub(): GitHubClient | null {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY } = process.env;
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) return null;
  return new GitHubClient({
    appId: GITHUB_APP_ID,
    privateKey: normalizePrivateKey(GITHUB_APP_PRIVATE_KEY),
    clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
    apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
    webUrl: process.env.GITHUB_WEB_URL ?? "https://github.com",
  });
}

async function repositoryFiles(
  db: Db,
  projectId: string,
  ref: string | null,
): Promise<SandboxFile[]> {
  const { data: repo } = await db
    .from("repositories")
    .select(
      "github_repo_id, full_name, default_branch, integrations!inner(installation_id, status)",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  const client = gitHub();
  if (!repo || !client || repo.integrations.status !== "active") return [];
  const { token } = await client.createInstallationToken(repo.integrations.installation_id, {
    repositoryIds: [repo.github_repo_id],
    permissions: SYNC_PERMISSIONS,
  });
  const archive = await client.getTarball(token, repo.full_name, ref ?? repo.default_branch);
  return readTar(archive, { strip: 1 });
}

async function overlayFiles(db: Db, changesetId: string): Promise<OverlayFile[]> {
  const { data: rows, error } = await db
    .from("changeset_files")
    .select("path, change, storage_key")
    .eq("changeset_id", changesetId);
  if (error) throw error;
  const files: OverlayFile[] = [];
  for (const row of rows ?? []) {
    if (row.change === "delete" || !row.storage_key) {
      files.push({ path: row.path, change: "delete" });
      continue;
    }
    const { data, error: readError } = await db.storage.from(BUCKET).download(row.storage_key);
    if (readError || !data) throw new Error(`read ${row.path}: ${readError?.message ?? "missing"}`);
    files.push({
      path: row.path,
      change: row.change,
      bytes: new Uint8Array(await data.arrayBuffer()),
    });
  }
  return files;
}

export async function loadTaskWorkspace(
  db: Db,
  projectId: string,
  taskId: string,
): Promise<TaskWorkspace> {
  const [{ data: row }, { data: changeset }] = await Promise.all([
    db.from("workspace_settings").select("*").eq("project_id", projectId).maybeSingle(),
    db
      .from("changesets")
      .select("id, base_sha")
      .eq("task_id", taskId)
      .eq("status", "open")
      .maybeSingle(),
  ]);
  const settings: TaskWorkspace["settings"] = {
    nodeMajor: row?.node_major ?? 24,
    skipFolders: row?.skip_folders ?? [...DEFAULT_LIMITS.skipFolders],
    maxFileBytes: (row?.max_file_mb ?? DEFAULT_LIMITS.maxFileMb) * 1024 * 1024,
    testCommand: row?.test_command ?? "pnpm test",
    approvalMode: row?.approval_mode ?? "safe_list",
    customCommands: row?.custom_commands ?? [],
    plainEnv: plainEnv(row?.plain_env),
    terminalIdleSeconds: row?.terminal_idle_seconds ?? 900,
    terminalMaxSessions: row?.terminal_max_sessions ?? 3,
    agentMaxIterations: row?.agent_max_iterations ?? 8,
  };
  const [repoFiles, overlay] = await Promise.all([
    repositoryFiles(db, projectId, changeset?.base_sha ?? null),
    changeset ? overlayFiles(db, changeset.id) : Promise.resolve([]),
  ]);
  return {
    settings,
    changeset: changeset ? { id: changeset.id, baseSha: changeset.base_sha } : null,
    snapshot: buildSnapshot({
      repoFiles,
      overlay,
      skipFolders: settings.skipFolders,
      maxFileBytes: settings.maxFileBytes,
    }),
  };
}

export type SyncResult = { paths: string[]; held: string[] };

/** Writes what changed in the sandbox into the change set. Safe to call again: it is incremental. */
export async function syncBack(
  db: Db,
  workspace: TaskWorkspace,
  session: SandboxSession,
): Promise<SyncResult> {
  const { changeset, snapshot, settings } = workspace;
  if (!changeset) return { paths: [], held: [] };
  const current = await session.hashes(settings.skipFolders);
  const changes = diffSnapshot(snapshot, current, settings.skipFolders);
  const held: string[] = [];
  const now = new Date().toISOString();
  for (const change of changes) {
    if (change.kind === "revert") {
      await db
        .from("changeset_files")
        .delete()
        .eq("changeset_id", changeset.id)
        .eq("path", change.path);
      continue;
    }
    if (change.kind === "delete") {
      const { error } = await db.from("changeset_files").upsert({
        changeset_id: changeset.id,
        path: change.path,
        change: "delete",
        storage_key: null,
        size_bytes: 0,
        sha256: null,
        is_binary: false,
        held_reason: null,
        updated_at: now,
      });
      if (error) throw error;
      continue;
    }
    const bytes = await session.readFile(change.path);
    if (!bytes || bytes.length > settings.maxFileBytes) continue;
    const binary = isBinary(bytes);
    const finding = scanForSecrets(change.path, binary ? null : new TextDecoder().decode(bytes));
    if (finding) held.push(change.path);
    const key = `${changeset.id}/${randomUUID()}`;
    const { error: storeError } = await db.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: "application/octet-stream", upsert: false });
    if (storeError) throw new Error(`store ${change.path}: ${storeError.message}`);
    const { error } = await db.from("changeset_files").upsert({
      changeset_id: changeset.id,
      path: change.path,
      change: change.change,
      storage_key: key,
      size_bytes: bytes.byteLength,
      sha256: sha256(bytes),
      is_binary: binary,
      held_reason: finding?.reason ?? null,
      updated_at: now,
    });
    if (error) throw error;
  }
  if (changes.length > 0) {
    await db.from("changesets").update({ updated_at: now }).eq("id", changeset.id);
  }
  // The next sync compares against what is now saved.
  snapshot.baseline = new Map(current);
  return { paths: changes.map((change) => change.path), held };
}
