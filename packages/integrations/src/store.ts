import { randomUUID } from "node:crypto";
import { writeAuditEvent, type AuditEventInput } from "@nexus/audit";
import type { Database, TablesInsert } from "@nexus/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTaskRefs } from "./task-refs";

/** A secret-key client: integration data is written server-side only (RLS grants no writes). */
export type Db = SupabaseClient<Database>;

export type RepoContext = {
  id: string;
  projectId: string;
  workspaceId: string;
  fullName: string;
};

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/**
 * The imported repository a webhook is about, or null when nobody imported it. Matching on the
 * installation as well as the repository ID means a delivery from another installation can never
 * touch this workspace's data.
 */
export async function findRepository(
  db: Db,
  installationId: number | null,
  githubRepoId: number,
): Promise<RepoContext | null> {
  if (installationId === null) return null;
  const data = check(
    await db
      .from("repositories")
      .select(
        "id, project_id, full_name, integrations!inner(installation_id, workspace_id, status)",
      )
      .eq("github_repo_id", githubRepoId)
      .eq("integrations.installation_id", installationId)
      .eq("integrations.status", "active")
      .maybeSingle(),
    "find repository",
  );
  if (!data) return null;
  return {
    id: data.id,
    projectId: data.project_id,
    workspaceId: data.integrations.workspace_id,
    fullName: data.full_name,
  };
}

export type LinkSource = {
  kind: "branch" | "commit" | "pull_request";
  ref: string;
  title?: string | null;
  url?: string | null;
  /** Text searched for NX-<n> task references. */
  texts: (string | null | undefined)[];
};

/** Links tasks to GitHub work that mentions them; returns the task refs that were linked. */
export async function linkTasks(
  db: Db,
  repo: RepoContext,
  sources: LinkSource[],
): Promise<number[]> {
  const wanted = sources.map((source) => ({ source, refs: parseTaskRefs(...source.texts) }));
  const allRefs = [...new Set(wanted.flatMap((entry) => entry.refs))];
  if (allRefs.length === 0) return [];

  const tasks =
    check(
      await db.from("tasks").select("id, ref").eq("project_id", repo.projectId).in("ref", allRefs),
      "find tasks",
    ) ?? [];
  const taskByRef = new Map(tasks.map((task) => [task.ref, task.id]));

  const rows: TablesInsert<"task_links">[] = [];
  for (const { source, refs } of wanted) {
    for (const ref of refs) {
      const taskId = taskByRef.get(ref);
      if (!taskId) continue;
      rows.push({
        task_id: taskId,
        repository_id: repo.id,
        kind: source.kind,
        ref: source.ref.slice(0, 255),
        title: source.title?.slice(0, 500) ?? null,
        url: source.url ?? null,
      });
    }
  }
  if (rows.length > 0) {
    check(
      await db
        .from("task_links")
        .upsert(rows, { onConflict: "task_id,kind,ref", ignoreDuplicates: true }),
      "link tasks",
    );
  }
  return [...new Set(rows.map((row) => tasks.find((task) => task.id === row.task_id)!.ref))].sort(
    (a, b) => a - b,
  );
}

/** Writes a system audit event; integration events appear on the project's activity timeline. */
export async function auditSystem(
  db: Db,
  input: Omit<AuditEventInput, "actorType" | "actorId" | "correlationId"> & {
    correlationId?: string;
  },
): Promise<void> {
  await writeAuditEvent(
    {
      from: (table) => ({
        insert: (row) => db.from(table).insert(row as TablesInsert<"audit_events">),
      }),
    },
    {
      ...input,
      actorId: null,
      actorType: "system",
      correlationId: input.correlationId ?? randomUUID(),
    },
  );
}

export { check };
