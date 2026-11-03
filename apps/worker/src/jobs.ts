import {
  CODER_SCHEMA,
  DEFAULT_SANDBOX_LIMITS,
  SANDBOX_EGRESS,
  coderInstructions,
  decideCommand,
  parsePlan,
  runCoder,
  runCoderCommand,
  type CoderEvent,
} from "@nexus/agents";
import type { AgentJob } from "@nexus/agents/boss";
import type { Database, Json } from "@nexus/db";
import {
  BudgetExceededError,
  ProviderDeclinedError,
  RouteBlockedError,
  type GatewayMessage,
} from "@nexus/model-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SetupError, runGateway, sandboxDriver } from "./runtime";
import { loadTaskWorkspace, syncBack } from "./workspace";

type Db = SupabaseClient<Database>;
type Run = Pick<
  Database["public"]["Tables"]["agent_runs"]["Row"],
  | "id"
  | "kind"
  | "status"
  | "purpose"
  | "project_id"
  | "task_id"
  | "budget_usd_micros"
  | "spent_usd_micros"
  | "max_iterations"
  | "iteration"
  | "state"
>;

/** Saved between a paused coding run and its resumption. */
type CoderState = { messages: GatewayMessage[]; pendingCommand: string; approvalId: string };

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const CANCEL_POLL_MS = 3_000;

/** Every stop names the setting behind it (ADR 0018). Kept under the 200-character column. */
export function describeFailure(error: unknown): string {
  if (error instanceof SetupError) return error.message;
  if (error instanceof BudgetExceededError) {
    if (error.scope === "run")
      return "Stopped: this run's budget is used up. Raise the per-run budget in Project → Settings → Models.";
    if (error.scope === "project")
      return "Stopped: the project budget is used up. Raise it in Project → Settings → Models, or lift the stop.";
    return "Stopped: the monthly cap is used up. Raise it in Settings → Models, or lift the stop.";
  }
  if (error instanceof ProviderDeclinedError)
    return "The provider declined under its own usage policy. Allow another provider or turn on fallback in Project → Settings → Models.";
  if (error instanceof RouteBlockedError)
    return "No allowed provider is set up for this project. Check Project → Settings → Models.";
  return "The agent run failed. Try again; if it keeps failing, check the worker logs.";
}

async function event(
  db: Db,
  run: Run,
  kind: CoderEvent["kind"] | "plan" | "diff" | "usage",
  summary: string,
) {
  await db.from("agent_events").insert({
    run_id: run.id,
    project_id: run.project_id,
    kind,
    summary: summary.slice(0, 2000),
  });
}

async function finish(
  db: Db,
  run: Run,
  values: Partial<Database["public"]["Tables"]["agent_runs"]["Update"]>,
) {
  // A run the owner cancelled stays cancelled.
  await db
    .from("agent_runs")
    .update({ finished_at: new Date().toISOString(), ...values })
    .eq("id", run.id)
    .eq("status", "running");
}

/** One queued job: a planner run, a coding run, or a coding run resumed after an approval. */
export async function processAgentJob(db: Db, job: AgentJob): Promise<void> {
  const { data: run } = await db
    .from("agent_runs")
    .select(
      "id, kind, status, purpose, project_id, task_id, budget_usd_micros, spent_usd_micros, max_iterations, iteration, state",
    )
    .eq("id", job.runId)
    .maybeSingle();
  if (!run || run.status !== "queued") return;
  const { data: claimed } = await db
    .from("agent_runs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", run.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed || claimed.length === 0) return;

  try {
    if (run.kind === "planner") await plan(db, run);
    else await code(db, run);
  } catch (error) {
    await finish(db, run, { status: "failed", error: describeFailure(error).slice(0, 200) });
  }
}

const sentence = (items: string[]) => `${items.join("; ").replace(/\.$/, "")}.`;

async function plan(db: Db, run: Run) {
  const gateway = await runGateway(db, run);
  const result = await gateway.complete({
    taskKind: "planning",
    messages: [
      {
        role: "user",
        content:
          'Reply with JSON only: {"tasks":[{"id":"1","title":"...","dependsOn":[],"risks":["..."],"acceptance":["..."]}]}\n\n' +
          run.purpose,
      },
    ],
    maxOutputTokens: 1200,
  });
  const parsed = parsePlan(result.text);
  await event(
    db,
    run,
    "plan",
    parsed.ok
      ? parsed.tasks
          .map(
            (task) =>
              `${task.id}. ${task.title}. Acceptance: ${sentence(task.acceptance)} Risk: ${sentence(task.risks)}`,
          )
          .join(" ")
      : "The model reply was not a task graph.",
  );
  await db
    .from("agent_runs")
    .update({
      status: parsed.ok ? "waiting_approval" : "failed",
      error: parsed.ok
        ? null
        : "The plan was not a task graph. Ask again, or choose another model.",
      spent_usd_micros: run.spent_usd_micros + result.costUsdMicros,
      iteration: 1,
      finished_at: parsed.ok ? null : new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "running");
}

async function code(db: Db, run: Run) {
  const workspace = await loadTaskWorkspace(db, run.project_id, run.task_id);
  if (!workspace.changeset) {
    throw new SetupError(
      "Start a branch for this task on the Code tab, then approve the plan again.",
    );
  }
  const gateway = await runGateway(db, run);
  const driver = await sandboxDriver();
  const session = await driver.open({
    limits: DEFAULT_SANDBOX_LIMITS,
    nodeMajor: workspace.settings.nodeMajor,
    allowlist: [...SANDBOX_EGRESS],
    label: `run-${run.id}`,
  });

  // The owner can cancel from the task page at any time; the loop stops at its next step.
  const cancel = new AbortController();
  const poll = setInterval(() => {
    void db
      .from("agent_runs")
      .select("status")
      .eq("id", run.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === "cancelled") cancel.abort();
      });
  }, CANCEL_POLL_MS);

  try {
    await session.writeFiles(workspace.snapshot.files);
    const commandOptions = {
      session,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
      env: workspace.settings.plainEnv,
      onEvent: (item: CoderEvent) => event(db, run, item.kind, item.summary),
    };

    const saved = run.state as CoderState | null;
    let messages: GatewayMessage[];
    if (saved?.pendingCommand) {
      const { data: approval } = await db
        .from("command_approvals")
        .select("decision")
        .eq("id", saved.approvalId)
        .maybeSingle();
      if (approval?.decision !== "approved") {
        await finish(db, run, { status: "cancelled", state: null });
        return;
      }
      messages = [...saved.messages, await runCoderCommand(commandOptions, saved.pendingCommand)];
    } else {
      const { data: plans } = await db
        .from("agent_events")
        .select("summary")
        .eq("run_id", run.id)
        .eq("kind", "plan");
      messages = coderInstructions({
        purpose: run.purpose,
        plan: (plans ?? []).map((row) => row.summary).join("\n") || "(no plan recorded)",
        testCommand: workspace.settings.testCommand,
      });
    }

    const result = await runCoder({
      ...commandOptions,
      complete: (history) =>
        gateway.complete({
          taskKind: "complex_code",
          messages: history,
          maxOutputTokens: 8000,
          jsonSchema: CODER_SCHEMA,
          // Approving the plan is the owner's go-ahead; the run budget is the guard.
          allowExpensive: true,
          signal: AbortSignal.any([cancel.signal, AbortSignal.timeout(180_000)]),
        }),
      messages,
      maxIterations: Math.max(0, run.max_iterations - run.iteration),
      budgetUsdMicros: run.budget_usd_micros,
      spentUsdMicros: run.spent_usd_micros,
      decide: (command) =>
        decideCommand(command, {
          mode: workspace.settings.approvalMode,
          custom: workspace.settings.customCommands,
        }),
      skipFolders: workspace.settings.skipFolders,
      signal: cancel.signal,
    });

    const synced = await syncBack(db, workspace, session);
    if (synced.paths.length > 0) {
      const held =
        synced.held.length > 0
          ? ` Held back (looks like a secret): ${synced.held.join(", ")}.`
          : "";
      await event(db, run, "diff", `Changed ${synced.paths.join(", ")}.${held}`);
    }
    const progress = {
      spent_usd_micros: result.spentUsdMicros,
      iteration: run.iteration + result.iterations,
    };

    switch (result.status) {
      case "approval": {
        const { data: approval, error } = await db
          .from("command_approvals")
          .insert({
            run_id: run.id,
            project_id: run.project_id,
            command: result.pendingCommand!.slice(0, 500),
          })
          .select("id")
          .single();
        if (error || !approval) throw error ?? new Error("approval not saved");
        const state: CoderState = {
          messages: result.messages,
          pendingCommand: result.pendingCommand!,
          approvalId: approval.id,
        };
        await event(
          db,
          run,
          "command",
          `Waiting for your approval: ${result.pendingCommand!.slice(0, 200)}`,
        );
        await db
          .from("agent_runs")
          .update({ ...progress, status: "waiting_approval", state: state as unknown as Json })
          .eq("id", run.id)
          .eq("status", "running");
        return;
      }
      case "done": {
        await event(db, run, "message", result.summary ?? "Done.");
        await finish(db, run, { ...progress, status: "succeeded", state: null });
        await db
          .from("tasks")
          .update({ state: "agent_complete" })
          .eq("id", run.task_id)
          .eq("state", "in_progress");
        return;
      }
      case "capped":
        await finish(db, run, {
          ...progress,
          status: "failed",
          state: null,
          error: `Stopped after ${progress.iteration} steps (the step limit). Raise it in Project → Settings → Workspace; the changes so far are in the change set.`,
        });
        return;
      case "budget":
        await finish(db, run, {
          ...progress,
          status: "failed",
          state: null,
          error: "Stopped: this run's budget is used up. The changes so far are in the change set.",
        });
        return;
      default:
        await db
          .from("agent_runs")
          .update({ ...progress, state: null })
          .eq("id", run.id);
    }
  } finally {
    clearInterval(poll);
    await session.close();
  }
}
