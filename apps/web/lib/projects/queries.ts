import "server-only";
import type { WorkflowState } from "@nexus/core";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Read-side queries for the project cockpit. All run as the signed-in user, so RLS applies. */

export const getProject = cache(async (projectId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) notFound();
  return data;
});

export async function listProjects() {
  const supabase = await createSupabaseServerClient();
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, client_name, status, archived_at, budget_usd, updated_at")
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("updated_at", { ascending: false }),
    supabase.from("tasks").select("project_id, state"),
  ]);
  const counts = new Map<string, { total: number; open: number }>();
  for (const task of tasks ?? []) {
    const entry = counts.get(task.project_id) ?? { total: 0, open: 0 };
    entry.total += 1;
    if (task.state !== "closed") entry.open += 1;
    counts.set(task.project_id, entry);
  }
  return (projects ?? []).map((project) => ({
    ...project,
    tasks: counts.get(project.id) ?? { total: 0, open: 0 },
  }));
}

export type BoardTask = {
  id: string;
  ref: number;
  title: string;
  state: WorkflowState;
  version: number;
  assignee: string | null;
  assignee_type: string;
  blocked_reason: string | null;
  due_date: string | null;
  budget_usd: number;
  milestone_id: string | null;
  requirement_id: string | null;
  created_at: string;
};

export const getProjectTasks = cache(async (projectId: string) => {
  const supabase = await createSupabaseServerClient();
  const [{ data: tasks }, { data: edges }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, ref, title, state, version, assignee, assignee_type, blocked_reason, due_date, budget_usd, milestone_id, requirement_id, created_at",
      )
      .eq("project_id", projectId)
      .order("ref"),
    supabase
      .from("task_dependencies")
      .select("task_id, depends_on_id, tasks!task_dependencies_task_id_fkey!inner(project_id)")
      .eq("tasks.project_id", projectId),
  ]);
  return {
    tasks: (tasks ?? []) as BoardTask[],
    edges: (edges ?? []).map((edge) => ({ taskId: edge.task_id, dependsOnId: edge.depends_on_id })),
  };
});

export async function getTask(projectId: string, taskId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) notFound();
  return data;
}

export const getRequirements = cache(async (projectId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("requirements")
    .select("id, ref, title, statement, priority, approval, version, updated_at")
    .eq("project_id", projectId)
    .order("ref");
  return data ?? [];
});

export async function getRequirement(projectId: string, requirementId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requirementId)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: requirement }, { data: history }] = await Promise.all([
    supabase
      .from("requirements")
      .select("*")
      .eq("id", requirementId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("requirement_versions")
      .select("version, snapshot, changed_at")
      .eq("requirement_id", requirementId)
      .order("version", { ascending: false }),
  ]);
  if (!requirement) notFound();
  return { requirement, history: history ?? [] };
}

export const getMilestones = cache(async (projectId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("milestones")
    .select("id, title, criteria, target_date, status, client_visible, version")
    .eq("project_id", projectId)
    .order("target_date", { ascending: true, nullsFirst: false });
  return data ?? [];
});

export async function getActivity(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: profiles }] = await Promise.all([
    supabase
      .from("audit_events")
      .select(
        "id, created_at, actor_id, actor_type, action, target_type, target_id, result, metadata",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, email, display_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  return (events ?? []).map((event) => ({
    ...event,
    actor: event.actor_id ? (names.get(event.actor_id) ?? "Former user") : event.actor_type,
  }));
}
