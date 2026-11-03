import type { BudgetSnapshot } from "./budget";
import { usdToMicros } from "./cost";
import { createStaffGateway } from "./complete";
import type { ProviderId } from "./gateway";
import { PROVISIONAL_FALLBACKS, PROVISIONAL_ROUTES } from "./prices";
import { createAnthropicAdapter } from "./adapters/anthropic";
import { createOpenAiAdapter } from "./adapters/openai";
import { createTemplateAdapter } from "./adapters/template";
import type { GatewayMessage, LedgerUsage, RouteChoice, StaffAdapter, TaskKind } from "./types";

/**
 * One project's gateway, built the same way in the web app and the worker (Sprint 5 settings):
 * the owner's routes, allowed providers, fallback switch, run and project budgets and the monthly
 * cap. Spending inside one gateway counts against all three scopes, so a long agent run stops at
 * its cap instead of re-reading a stale snapshot.
 */

export type ProviderKeys = {
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  XAI_API_KEY?: string | undefined;
  GROQ_API_KEY?: string | undefined;
};

export function adaptersFromKeys(keys: ProviderKeys): StaffAdapter[] {
  const adapters: StaffAdapter[] = [];
  if (keys.ANTHROPIC_API_KEY)
    adapters.push(createAnthropicAdapter({ apiKey: keys.ANTHROPIC_API_KEY }));
  if (keys.OPENAI_API_KEY) adapters.push(createOpenAiAdapter({ apiKey: keys.OPENAI_API_KEY }));
  if (keys.XAI_API_KEY)
    adapters.push(createTemplateAdapter({ provider: "xai", apiKey: keys.XAI_API_KEY }));
  if (keys.GROQ_API_KEY)
    adapters.push(createTemplateAdapter({ provider: "groq", apiKey: keys.GROQ_API_KEY }));
  return adapters;
}

const FIXTURE_PRICE = {
  inputUsdMicrosPerMillion: 1_000_000,
  outputUsdMicrosPerMillion: 0,
  cachedInputUsdMicrosPerMillion: 0,
  vision: true,
};

/**
 * A recorded reply for local tests only (the caller checks the fixture flag and a local
 * Supabase). One call costs $0.01. The Anthropic fixture declines any prompt containing
 * "fixture: decline", to test routing round a refusal.
 */
export function createFixtureAdapter(
  id: ProviderId,
  reply: (messages: GatewayMessage[]) => string = () => `Recorded reply from ${id}.`,
): StaffAdapter {
  return {
    id,
    capabilities: { vision: true, tools: false, structuredOutput: true },
    price: () => FIXTURE_PRICE,
    quote: () => ({ estimatedUsdMicros: 10_000, inputTokens: 10_000, imageCount: 0 }),
    async complete(request) {
      const prompt = JSON.stringify(request.messages);
      return {
        declined: id === "anthropic" && prompt.includes("fixture: decline"),
        text: reply(request.messages),
        toolCalls: [],
        usage: { inputTokens: 10_000, outputTokens: 0, cachedTokens: 0, imageCount: 0 },
        providerRequestId: null,
      };
    },
  };
}

export type ProjectModelSettings = {
  allowed_providers: ProviderId[];
  allow_fallback: boolean;
  run_budget_usd: number | string;
  monthly_budget_usd: number | string;
  extended_until: string | null;
};

export type ProjectGatewayInput = {
  adapters: StaffAdapter[];
  settings: ProjectModelSettings;
  cap: { monthly_usd: number | string; extended_until: string | null };
  projectSpentUsdMicros: number;
  globalSpentUsdMicros: number;
  routeRows: readonly { task_kind: TaskKind; provider: ProviderId; model: string }[];
  /** An agent run's own cap; otherwise the project's per-run budget. */
  runLimitUsdMicros?: number;
  runSpentUsdMicros?: number;
  onUsage: (record: LedgerUsage) => void | Promise<void>;
  now?: () => number;
};

function stillExtended(until: string | null, now: number): boolean {
  return until !== null && new Date(until).getTime() > now;
}

export function projectBudget(input: ProjectGatewayInput): BudgetSnapshot {
  const now = (input.now ?? Date.now)();
  return {
    run: {
      spentUsdMicros: input.runSpentUsdMicros ?? 0,
      limitUsdMicros: input.runLimitUsdMicros ?? usdToMicros(Number(input.settings.run_budget_usd)),
      extended: false,
    },
    project: {
      spentUsdMicros: input.projectSpentUsdMicros,
      limitUsdMicros: usdToMicros(Number(input.settings.monthly_budget_usd)),
      extended: stillExtended(input.settings.extended_until, now),
    },
    global: {
      spentUsdMicros: input.globalSpentUsdMicros,
      limitUsdMicros: usdToMicros(Number(input.cap.monthly_usd)),
      extended: stillExtended(input.cap.extended_until, now),
    },
  };
}

export function createProjectGateway(input: ProjectGatewayInput) {
  const routes = { ...PROVISIONAL_ROUTES } as Record<TaskKind, RouteChoice>;
  for (const row of input.routeRows) {
    routes[row.task_kind] = { provider: row.provider, model: row.model };
  }
  const budget = projectBudget(input);
  return createStaffGateway({
    adapters: input.adapters,
    routes,
    fallbacks: [...PROVISIONAL_FALLBACKS],
    allowed: new Set(input.settings.allowed_providers),
    allowFallback: input.settings.allow_fallback,
    budget,
    onUsage: async (record) => {
      budget.run.spentUsdMicros += record.costUsdMicros;
      budget.project.spentUsdMicros += record.costUsdMicros;
      budget.global.spentUsdMicros += record.costUsdMicros;
      await input.onUsage(record);
    },
    ...(input.now ? { now: input.now } : {}),
  });
}
