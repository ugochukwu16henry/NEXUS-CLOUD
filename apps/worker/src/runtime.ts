import { createDockerDriver, createRecordedDriver, type SandboxDriver } from "@nexus/agents";
import type { Database } from "@nexus/db";
import {
  adaptersFromKeys,
  createFixtureAdapter,
  createProjectGateway,
  type GatewayMessage,
  type LedgerUsage,
  type StaffAdapter,
} from "@nexus/model-gateway";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;
type Provider = Database["public"]["Enums"]["model_provider"];

/** Recorded models and the recorded sandbox only run against a local Supabase (same rule as the web). */
export function fixtureMode(): boolean {
  const flag = process.env.NEXUS_AGENT_FIXTURE ?? process.env.NEXUS_MODEL_FIXTURE;
  if (flag !== "1") return false;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * The sandbox driver (ADR 0019): the managed service when E2B_API_KEY is set, Docker otherwise,
 * the recorded one in local tests. NEXUS_SANDBOX_DRIVER picks one explicitly.
 */
export async function sandboxDriver(): Promise<SandboxDriver> {
  const choice =
    process.env.NEXUS_SANDBOX_DRIVER ??
    (process.env.E2B_API_KEY ? "e2b" : fixtureMode() ? "recorded" : "docker");
  if (choice === "recorded") {
    if (!fixtureMode()) throw new Error("the recorded sandbox is for local tests only");
    return createRecordedDriver();
  }
  if (choice === "e2b") {
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) throw new Error("E2B_API_KEY is not set");
    const { createE2bDriver } = await import("@nexus/agents/e2b");
    return createE2bDriver({
      apiKey,
      ...(process.env.E2B_TEMPLATE ? { template: process.env.E2B_TEMPLATE } : {}),
    });
  }
  return createDockerDriver({
    network: process.env.NEXUS_SANDBOX_DOCKER_NETWORK === "bridge" ? "bridge" : "none",
  });
}

const RECORDED_PLAN = {
  tasks: [
    {
      id: "1",
      title: "Add a farewell helper",
      dependsOn: [],
      risks: ["The change is uncommitted until you review the diff."],
      acceptance: ["src/index.ts exports farewell"],
    },
  ],
};

/**
 * The recorded coder: list, read, edit src/index.ts, run the safe-list test command, then a
 * command that needs the owner, then finish. It counts its own earlier replies, so a run resumed
 * after an approval carries on from the right step.
 */
const RECORDED_STEPS = [
  { tool: "list_files" },
  { tool: "read_file", path: "src/index.ts" },
  {
    tool: "write_file",
    path: "src/index.ts",
    content:
      "export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n\n" +
      "export function farewell(name: string) {\n  return `Goodbye, ${name}`;\n}\n",
  },
  { tool: "run_command", command: "pnpm test" },
  { tool: "run_command", command: "node scripts/check.mjs" },
  { tool: "finish", summary: "Added farewell next to greet." },
];

export function recordedReply(messages: GatewayMessage[]): string {
  const prompt = JSON.stringify(messages);
  if (prompt.includes("You are the coding agent")) {
    const done = messages.filter((message) => message.role === "assistant").length;
    return JSON.stringify(RECORDED_STEPS[Math.min(done, RECORDED_STEPS.length - 1)]);
  }
  return JSON.stringify(RECORDED_PLAN);
}

export function modelAdapters(): StaffAdapter[] {
  if (fixtureMode()) {
    return [
      createFixtureAdapter("anthropic", recordedReply),
      createFixtureAdapter("openai", recordedReply),
    ];
  }
  return adaptersFromKeys(process.env);
}

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function spentMicros(db: Db, projectId: string | null): Promise<number> {
  let query = db.from("usage_ledger").select("cost_usd_micros").gte("created_at", monthStart());
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.cost_usd_micros, 0);
}

/**
 * The project's gateway for one agent run: the owner's routes, providers, fallback switch,
 * project budget and monthly cap (Sprint 5), with the run's own cap. Every attempt is written to
 * the ledger against the run.
 */
export async function runGateway(
  db: Db,
  run: {
    id: string;
    project_id: string;
    task_id: string;
    budget_usd_micros: number;
    spent_usd_micros: number;
  },
) {
  const adapters = modelAdapters();
  if (adapters.length === 0) throw new SetupError("No model provider is configured on the worker.");
  const [settings, cap, projectSpent, globalSpent, routes] = await Promise.all([
    db.from("project_model_settings").select("*").eq("project_id", run.project_id).maybeSingle(),
    db.from("spend_caps").select("monthly_usd, extended_until").eq("scope", "global").single(),
    spentMicros(db, run.project_id),
    spentMicros(db, null),
    db.from("model_routes").select("task_kind, provider, model"),
  ]);
  if (!settings.data) throw new SetupError("This project has no model settings yet.");
  if (!cap.data) throw new SetupError("The monthly spend cap is missing.");
  return createProjectGateway({
    adapters,
    settings: settings.data,
    cap: cap.data,
    projectSpentUsdMicros: projectSpent,
    globalSpentUsdMicros: globalSpent,
    routeRows: routes.data ?? [],
    runLimitUsdMicros: run.budget_usd_micros,
    runSpentUsdMicros: run.spent_usd_micros,
    onUsage: async (record: LedgerUsage) => {
      await db.from("usage_ledger").insert({
        project_id: run.project_id,
        task_id: run.task_id,
        run_id: run.id,
        provider: record.provider as Provider,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        cached_tokens: record.cachedTokens,
        image_count: record.imageCount,
        cost_usd_micros: record.costUsdMicros,
        ok: record.ok,
        error: record.error?.slice(0, 80) ?? null,
        fallback_from_provider: (record.fallbackFrom?.provider ?? null) as Provider | null,
        fallback_from_model: record.fallbackFrom?.model ?? null,
        latency_ms: record.latencyMs,
      });
    },
  });
}

/** A setup problem the owner fixes in settings; its message is shown as the run's error. */
export class SetupError extends Error {
  override name = "SetupError";
}
