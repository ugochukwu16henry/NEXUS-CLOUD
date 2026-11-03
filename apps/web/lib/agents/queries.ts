import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getLatestAgentRun(taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agent_runs")
    .select(
      "id, kind, status, purpose, spent_usd_micros, budget_usd_micros, iteration, max_iterations, error",
    )
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function listAgentEvents(runId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agent_events")
    .select("id, kind, summary, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listPendingCommands(runId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("command_approvals")
    .select("id, command, decision, reason")
    .eq("run_id", runId)
    .eq("decision", "pending")
    .order("created_at", { ascending: true });
  return data ?? [];
}

/** Recent runs across every project the owner can see (RLS), newest first, for the Agents page. */
export async function listRecentRuns(limit = 50) {
  const supabase = await createSupabaseServerClient();
  const [{ data: runs }, { data: projects }, { data: waiting }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select(
        "id, project_id, task_id, kind, status, purpose, spent_usd_micros, budget_usd_micros, iteration, max_iterations, error, created_at, finished_at, tasks(ref, title)",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("projects").select("id, name"),
    supabase
      .from("command_approvals")
      .select("id, run_id, command, created_at")
      .eq("decision", "pending")
      .order("created_at", { ascending: true }),
  ]);
  const names = new Map((projects ?? []).map((project) => [project.id, project.name]));
  return {
    runs: (runs ?? []).map((run) => ({
      ...run,
      projectName: names.get(run.project_id) ?? "Project",
    })),
    waiting: waiting ?? [],
  };
}
