import "server-only";
import type { Database } from "@nexus/db";
import {
  BudgetExceededError,
  ExpensiveActionRequiredError,
  LISTED_MODELS,
  PROVIDER_LABELS,
  ProviderDeclinedError,
  RouteBlockedError,
  SchemaError,
  UnknownModelError,
  VisionUnsupportedError,
  adaptersFromKeys,
  createFixtureAdapter,
  createProjectGateway,
  type GatewayMessage,
  type LedgerUsage,
  type RouteChoice,
  type StaffAdapter,
  type TaskKind,
} from "@nexus/model-gateway";
import { getServerEnv } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { allowFixtureMode } from "./fixture-mode";

type Provider = Database["public"]["Enums"]["model_provider"];
type Settings = Database["public"]["Tables"]["project_model_settings"]["Row"];

function liveAdapters(): StaffAdapter[] {
  const env = getServerEnv();
  if (allowFixtureMode(env.NEXUS_MODEL_FIXTURE, env.NEXT_PUBLIC_SUPABASE_URL)) {
    return [createFixtureAdapter("anthropic"), createFixtureAdapter("openai")];
  }
  return adaptersFromKeys(env);
}

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

const PROVIDER_NAMES: Record<string, string> = PROVIDER_LABELS;
const nameOf = (route: RouteChoice) =>
  `${PROVIDER_NAMES[route.provider] ?? route.provider} ${route.model}`;

/** Every model the owner can pick right now: priced, on a provider whose key is set. */
export function listAvailableModels(): { value: string; label: string }[] {
  const configured = new Set(liveAdapters().map((adapter) => adapter.id));
  return LISTED_MODELS.filter((model) => configured.has(model.provider)).map((model) => ({
    value: `${model.provider}/${model.model}`,
    // Free models say so, so the owner can pick them knowingly.
    label: `${PROVIDER_NAMES[model.provider] ?? model.provider} · ${model.label}${
      model.free && !model.label.includes("(free)") ? " (free)" : ""
    }`,
  }));
}

/**
 * Every stop names the setting behind it and how to change it (ADR 0018): limits are the
 * owner's own settings, and a provider's refusal is that provider's decision, not Nexus's.
 */
function failureMessage(error: unknown): string {
  if (error instanceof ProviderDeclinedError) {
    const others = error.alternatives.slice(0, 4).map(nameOf);
    const who = PROVIDER_NAMES[error.provider] ?? error.provider;
    return others.length > 0
      ? `${who} declined this request under its own usage policy. Try another provider: choose ${others.join(", ")} under AI model, and ask again.`
      : `${who} declined this request under its own usage policy. No other provider is set up yet: add another provider's key on the server (Settings → Models).`;
  }
  if (error instanceof BudgetExceededError) {
    const scope =
      error.scope === "run"
        ? "this run"
        : error.scope === "project"
          ? "the project budget"
          : "the monthly cap";
    const where = error.scope === "global" ? "Settings → Models" : "Project → Settings → Models";
    return `Stopped: ${scope} is used up. Raise it in ${where}, or lift the stop for 24 hours.`;
  }
  if (error instanceof ExpensiveActionRequiredError) {
    return "This request is large. Tick “spend anyway” to go ahead.";
  }
  if (error instanceof VisionUnsupportedError)
    return `${error.model} can't read images. Choose a model that can under AI model.`;
  if (error instanceof RouteBlockedError) {
    if (error.reason === "fallback_disabled") {
      return "The model failed, and automatic fallback is off for this project. Turn it on in Project → Settings → Models, or choose another model under AI model.";
    }
    if (error.reason === "provider_not_allowed")
      return "That provider is switched off for this project. Turn it on in Project → Settings → Models.";
    return "No provider is both set up and allowed for this project. Check Project → Settings → Models.";
  }
  if (error instanceof UnknownModelError)
    return "That model has no recorded price yet, so Nexus won't spend on it blind. Choose a listed model.";
  if (error instanceof SchemaError) return "The model reply did not match the requested format.";
  return "The model call failed.";
}

async function spentMicros(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  projectId: string | null,
): Promise<number> {
  let query = admin.from("usage_ledger").select("cost_usd_micros").gte("created_at", monthStart());
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.cost_usd_micros, 0);
}

async function loadSettings(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  projectId: string,
): Promise<Settings | null> {
  const { data, error } = await admin
    .from("project_model_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ModelCallResult = {
  status: "success" | "error";
  message: string;
  /** The model's reply alone; `message` adds budget warnings and fallback notes. */
  reply?: string;
  notes?: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * One owner prompt. The budget guard runs before any provider is contacted, and every attempt
 * is written to the ledger. Provider keys stay in this function.
 */
export async function runModelPrompt(input: {
  projectId: string;
  taskKind: TaskKind;
  prompt: string;
  allowExpensive: boolean;
  /** The owner's own pick; otherwise the route for the task type. */
  manual?: RouteChoice | null;
}): Promise<ModelCallResult> {
  return runModelMessages({
    projectId: input.projectId,
    taskKind: input.taskKind,
    messages: [{ role: "user", content: input.prompt }],
    maxOutputTokens: 256,
    allowExpensive: input.allowExpensive,
    manual: input.manual ?? null,
  });
}

/** A whole conversation (the project Agent chat), through the same budget guard and ledger. */
export async function runModelMessages(input: {
  projectId: string;
  taskKind: TaskKind;
  messages: GatewayMessage[];
  maxOutputTokens: number;
  allowExpensive: boolean;
  manual?: RouteChoice | null;
}): Promise<ModelCallResult> {
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { status: "error", message: "That project no longer exists." };

  const adapters = liveAdapters();
  if (adapters.length === 0) {
    return { status: "error", message: "No model provider is configured on the server." };
  }

  const admin = createSupabaseAdminClient();
  const [settings, cap, projectSpent, globalSpent, routeRows] = await Promise.all([
    loadSettings(admin, input.projectId),
    admin.from("spend_caps").select("monthly_usd, extended_until").eq("scope", "global").single(),
    spentMicros(admin, input.projectId),
    spentMicros(admin, null),
    admin.from("model_routes").select("task_kind, provider, model"),
  ]);
  if (cap.error || !cap.data) return { status: "error", message: "The spend cap is missing." };
  if (!settings) return { status: "error", message: "This project has no model settings yet." };
  if (routeRows.error) return { status: "error", message: "The model routes could not be read." };

  const attempts: LedgerUsage[] = [];
  const gateway = createProjectGateway({
    adapters,
    settings,
    cap: cap.data,
    projectSpentUsdMicros: projectSpent,
    globalSpentUsdMicros: globalSpent,
    routeRows: routeRows.data ?? [],
    onUsage: (record) => void attempts.push(record),
  });

  let outcome: ModelCallResult;
  try {
    const result = await gateway.complete({
      taskKind: input.taskKind,
      messages: input.messages,
      maxOutputTokens: input.maxOutputTokens,
      allowExpensive: input.allowExpensive,
      manual: input.manual ?? null,
    });
    const warnings = result.warnings.map((warning) => {
      const scope =
        warning.scope === "project"
          ? "project budget"
          : warning.scope === "global"
            ? "monthly cap"
            : "run cap";
      return `Warning: ${warning.percent}% of the ${scope}.`;
    });
    const declined = attempts.some((attempt) => attempt.error === "ProviderDeclined");
    const switched = result.fallbackFrom
      ? `${nameOf(result.fallbackFrom)} ${declined ? "declined" : "was unavailable"}; answered by ${nameOf(result)}.`
      : "";
    outcome = {
      status: "success",
      message: [result.text, ...warnings, switched].filter(Boolean).join(" "),
      reply: result.text,
      notes: [...warnings, switched].filter(Boolean),
      metadata: {
        provider: result.provider,
        model: result.model,
        costUsdMicros: result.costUsdMicros,
        fallback: result.fallbackFrom?.model ?? null,
      },
    };
  } catch (error) {
    outcome = { status: "error", message: failureMessage(error) };
  }

  if (attempts.length > 0) {
    const { error } = await admin.from("usage_ledger").insert(
      attempts.map((record) => ({
        project_id: input.projectId,
        provider: record.provider as Provider,
        model: record.model,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        cached_tokens: record.cachedTokens,
        image_count: record.imageCount,
        cost_usd_micros: record.costUsdMicros,
        ok: record.ok,
        error: record.error,
        fallback_from_provider: (record.fallbackFrom?.provider ?? null) as Provider | null,
        fallback_from_model: record.fallbackFrom?.model ?? null,
        latency_ms: record.latencyMs,
      })),
    );
    if (error) reportError(error, { action: "model.complete", projectId: input.projectId });
  }
  return outcome;
}
