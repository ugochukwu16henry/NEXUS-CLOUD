"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decideCommand as decideCommandPolicy, issueTicket, validateContract } from "@nexus/agents";
import { usdToMicros } from "@nexus/model-gateway";
import { defineAction } from "@/lib/actions";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOpenChangeset, getWorkspaceLimits } from "@/lib/workspace/server";

const purpose = z.string().trim().min(1, "Say what the agent should do.").max(4000);

async function visibleProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  return data;
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Hands a run to the worker (pg-boss). The key makes a double submit one job. */
async function enqueue(runId: string, key: string): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;
  const { enqueueAgentRun, startBoss } = await import("@nexus/agents/boss");
  const boss = await startBoss(databaseUrl);
  await enqueueAgentRun(boss, { runId }, key);
  return true;
}

const NO_QUEUE = "Set DATABASE_URL so the worker queue can run this.";

export const planAgent = defineAction(
  {
    name: "agent.plan",
    access: "project:write",
    parse: parseForm(
      z.object({
        projectId: id,
        taskId: id,
        purpose,
        idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/, "Bad request id."),
      }),
    ),
  },
  async (input) => {
    const audit = { projectId: input.projectId, targetType: "task", targetId: input.taskId };
    if (!(await visibleProject(input.projectId))) {
      return { status: "error", message: "That project no longer exists.", audit };
    }
    if (!process.env.DATABASE_URL) return { status: "error", message: NO_QUEUE, audit };
    const admin = createSupabaseAdminClient();
    const [limits, { data: models }] = await Promise.all([
      getWorkspaceLimits(input.projectId),
      admin
        .from("project_model_settings")
        .select("run_budget_usd")
        .eq("project_id", input.projectId)
        .maybeSingle(),
    ]);
    // The owner's own limits (ADR 0018): the per-run budget and the step limit from settings.
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
    if (!contract.ok) {
      return { status: "error", message: "The agent contract is incomplete.", audit };
    }
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { status: "success", message: "That plan was already requested.", audit };
    }
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
    if (error) return { status: "error", message: "Couldn't queue the plan.", audit };
    await enqueue(runId, input.idempotencyKey);
    refresh(input.projectId);
    return {
      status: "success",
      message: "Plan queued. The worker is writing it.",
      audit: { ...audit, metadata: { runId, kind: "planner" } },
    };
  },
);

export const approvePlan = defineAction(
  {
    name: "agent.approve_plan",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, taskId: id, runId: id })),
  },
  async (input, context) => {
    const audit = { projectId: input.projectId, targetType: "agent_run", targetId: input.runId };
    const denied = context.require(
      "task:approve",
      `/projects/${input.projectId}/tasks/${input.taskId}`,
    );
    if (denied) return { ...denied, audit };
    const admin = createSupabaseAdminClient();
    const { data: run } = await admin
      .from("agent_runs")
      .select("id, status, kind, task_id, project_id")
      .eq("id", input.runId)
      .maybeSingle();
    if (!run || run.task_id !== input.taskId || run.project_id !== input.projectId) {
      return { status: "error", message: "That plan is not on this task.", audit };
    }
    if (run.status !== "waiting_approval" || run.kind !== "planner") {
      return { status: "error", message: "This plan is not waiting for approval.", audit };
    }
    const changeset = await getOpenChangeset(input.taskId);
    if (!changeset) {
      return {
        status: "error",
        message: "Start a branch for this task on the Code tab, then approve the plan again.",
        audit,
      };
    }
    if (!process.env.DATABASE_URL) return { status: "error", message: NO_QUEUE, audit };
    // The same run continues as the coder, so the plan stays next to the work it led to.
    const { data: moved } = await admin
      .from("agent_runs")
      .update({ kind: "coder", status: "queued", iteration: 0, finished_at: null })
      .eq("id", run.id)
      .eq("status", "waiting_approval")
      .select("id");
    if (!moved || moved.length === 0) {
      return { status: "error", message: "This plan is not waiting for approval.", audit };
    }
    await enqueue(run.id, `code-${run.id}`);
    refresh(input.projectId);
    return {
      status: "success",
      message:
        "Plan approved. The coder is working in a sandbox; its diff lands in the change set.",
      audit: { ...audit, metadata: { kind: "coder" } },
    };
  },
);

export const cancelAgent = defineAction(
  {
    name: "agent.cancel",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, taskId: id, runId: id })),
  },
  async (input) => {
    const audit = { projectId: input.projectId, targetType: "agent_run", targetId: input.runId };
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("agent_runs")
      .update({ status: "cancelled", state: null, finished_at: new Date().toISOString() })
      .eq("id", input.runId)
      .eq("task_id", input.taskId)
      .in("status", ["queued", "running", "waiting_approval"])
      .select("id");
    if (!data || data.length === 0) {
      return { status: "error", message: "That run is already finished.", audit };
    }
    await admin
      .from("command_approvals")
      .update({ decision: "denied", reason: "run cancelled", decided_at: new Date().toISOString() })
      .eq("run_id", input.runId)
      .eq("decision", "pending");
    refresh(input.projectId);
    return { status: "success", message: "Run cancelled.", audit };
  },
);

export const decideCommand = defineAction(
  {
    name: "agent.command",
    access: "project:write",
    parse: parseForm(
      z.object({
        projectId: id,
        taskId: id,
        approvalId: id,
        decision: z.enum(["approved", "denied"]),
      }),
    ),
  },
  async (input, context) => {
    const audit = {
      projectId: input.projectId,
      targetType: "command_approval",
      targetId: input.approvalId,
    };
    const denied = context.require(
      "task:approve",
      `/projects/${input.projectId}/tasks/${input.taskId}`,
    );
    if (denied) return { ...denied, audit };
    const admin = createSupabaseAdminClient();
    const { data: row } = await admin
      .from("command_approvals")
      .select("id, command, decision, run_id")
      .eq("id", input.approvalId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (!row || row.decision !== "pending") {
      return { status: "error", message: "That command is not waiting.", audit };
    }
    const now = new Date().toISOString();
    const policy = decideCommandPolicy(row.command, { mode: "safe_list" });
    if (policy.effect === "deny" || input.decision === "denied") {
      const reason = policy.effect === "deny" ? policy.reason : "owner denied";
      await admin
        .from("command_approvals")
        .update({ decision: "denied", reason, decided_at: now })
        .eq("id", row.id);
      if (policy.effect === "deny") {
        await admin.from("agent_events").insert({
          run_id: row.run_id,
          project_id: input.projectId,
          kind: "finding",
          summary: policy.reason,
        });
      }
      await admin
        .from("agent_runs")
        .update({ status: "cancelled", state: null, finished_at: now })
        .eq("id", row.run_id)
        .eq("status", "waiting_approval");
      refresh(input.projectId);
      return {
        status: "success",
        message:
          policy.effect === "deny"
            ? "Command refused by policy. The run stopped."
            : "Command denied. The run stopped.",
        audit,
      };
    }
    await admin
      .from("command_approvals")
      .update({ decision: "approved", decided_at: now })
      .eq("id", row.id);
    await admin
      .from("agent_runs")
      .update({ status: "queued" })
      .eq("id", row.run_id)
      .eq("status", "waiting_approval");
    await enqueue(row.run_id, `resume-${row.id}`);
    refresh(input.projectId);
    return {
      status: "success",
      message: "Command approved. The run continues.",
      audit: { ...audit, metadata: { command: row.command.slice(0, 120) } },
    };
  },
);

export const startTerminal = defineAction(
  {
    name: "terminal.start",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, taskId: id })),
  },
  async (input, context) => {
    const audit = { projectId: input.projectId, targetType: "task", targetId: input.taskId };
    const denied = context.require(
      "terminal:start",
      `/projects/${input.projectId}/code?task=${input.taskId}`,
    );
    if (denied) return { ...denied, audit };
    if (!(await visibleProject(input.projectId))) {
      return { status: "error", message: "That project no longer exists.", audit };
    }
    const limits = await getWorkspaceLimits(input.projectId);
    const ticket = issueTicket();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("sandbox_sessions").insert({
      project_id: input.projectId,
      task_id: input.taskId,
      kind: "terminal",
      ticket_hash: ticket.hash,
      expires_at: new Date(ticket.expiresAt).toISOString(),
      idle_seconds: limits.terminalIdleSeconds,
      created_by: context.viewer?.userId ?? null,
    });
    if (error) return { status: "error", message: "Couldn't open a terminal session.", audit };
    return {
      status: "success",
      message: "Terminal ticket issued. It expires in 60 seconds.",
      data: { ticket: ticket.token },
      audit,
    };
  },
);
