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
