import "server-only";
import { randomUUID } from "node:crypto";
import { validateContract } from "@nexus/agents";
import { usdToMicros } from "@nexus/model-gateway";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceLimits } from "@/lib/workspace/server";

/**
 * Starting agent runs, shared by a task's Agent panel and the project Agent chat. Callers check
 * the owner's access first; rows are written with the secret key.
 */

export const NO_QUEUE = "Set DATABASE_URL so the worker queue can run this.";

/** Hands a run to the worker (pg-boss). The key makes a double submit one job. */
export async function enqueueRun(runId: string, key: string): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;
  const { enqueueAgentRun, startBoss } = await import("@nexus/agents/boss");
  const boss = await startBoss(databaseUrl);
  await enqueueAgentRun(boss, { runId }, key);
  return true;
}

export type QueuePlanResult =
  { ok: true; runId: string | null; duplicate: boolean } | { ok: false; message: string };

/** Queues the planner for a task, within the owner's per-run budget and step limit (ADR 0018). */
export async function queuePlan(input: {
  projectId: string;
  taskId: string;
  purpose: string;
  idempotencyKey: string;
}): Promise<QueuePlanResult> {
  if (!process.env.DATABASE_URL) return { ok: false, message: NO_QUEUE };
  const admin = createSupabaseAdminClient();
  const [limits, { data: models }] = await Promise.all([
    getWorkspaceLimits(input.projectId),
    admin
      .from("project_model_settings")
      .select("run_budget_usd")
      .eq("project_id", input.projectId)
      .maybeSingle(),
  ]);
  const contract = validateContract({
    purpose: input.purpose,
    context: "The task's files in a sandbox: the repository plus the task's change set.",
    expectedOutput: "An approved plan, then a reviewable diff.",
    budgetUsdMicros: Math.max(1, usdToMicros(Number(models?.run_budget_usd ?? 0.25))),
    maxIterations: limits.agentMaxIterations,
    stopCondition:
      "Stop when the plan is waiting for approval, the work is done, the budget or step limit is reached, or the owner cancels.",
    allowedTools: ["read_file", "search", "write_file", "run_command"],
  });
  if (!contract.ok) return { ok: false, message: "The agent contract is incomplete." };
  const { data: existing } = await admin
    .from("agent_runs")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return { ok: true, runId: existing.id, duplicate: true };
  const runId = randomUUID();
  const { error } = await admin.from("agent_runs").insert({
    id: runId,
    project_id: input.projectId,
    task_id: input.taskId,
    kind: "planner",
    status: "queued",
    purpose: contract.contract.purpose,
    stop_condition: contract.contract.stopCondition,
    budget_usd_micros: contract.contract.budgetUsdMicros,
    max_iterations: contract.contract.maxIterations,
    idempotency_key: input.idempotencyKey,
  });
  if (error) return { ok: false, message: "Couldn't queue the plan." };
  await enqueueRun(runId, input.idempotencyKey);
  return { ok: true, runId, duplicate: false };
}
