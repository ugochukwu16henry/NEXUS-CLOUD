import type { ProviderId } from "./gateway";
import type { TokenPrice } from "./types";

/**
 * List prices checked on 2026-11-03.
 * Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 *   (Haiku 5.5 is the ≤100k-token rate; longer prompts cost more — see the register.)
 * OpenAI short-context: https://developers.openai.com/api/docs/pricing
 * Accounts are not funded. Do not treat these as a benchmark result.
 */
export type ListedModel = TokenPrice & {
  provider: ProviderId;
  model: string;
  label: string;
  /** Costs nothing to call (a provider's free model, within its caps). */
  free?: boolean;
};

const perMillion = (usd: number) => Math.round(usd * 1_000_000);

const FREE = {
  inputUsdMicrosPerMillion: 0,
  outputUsdMicrosPerMillion: 0,
  cachedInputUsdMicrosPerMillion: 0,
  free: true,
} as const;

export const LISTED_MODELS: ListedModel[] = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    inputUsdMicrosPerMillion: perMillion(2),
    outputUsdMicrosPerMillion: perMillion(10),
    cachedInputUsdMicrosPerMillion: perMillion(0.1),
    vision: true,
  },
  {
    provider: "anthropic",
    model: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    inputUsdMicrosPerMillion: perMillion(0.1),
    outputUsdMicrosPerMillion: perMillion(0.5),
    cachedInputUsdMicrosPerMillion: perMillion(0.01),
    vision: true,
  },
  {
    provider: "openai",
    model: "gpt-6.1-sol",
    label: "GPT-6.1 Sol",
    inputUsdMicrosPerMillion: perMillion(2),
    outputUsdMicrosPerMillion: perMillion(10),
    cachedInputUsdMicrosPerMillion: perMillion(0.1),
    vision: true,
  },
  {
    provider: "openai",
    model: "gpt-6-luna",
    label: "GPT-6 Luna",
    inputUsdMicrosPerMillion: perMillion(0.1),
    outputUsdMicrosPerMillion: perMillion(0.5),
    cachedInputUsdMicrosPerMillion: perMillion(0.01),
    // Vision was not confirmed on the pricing page, so images are not sent.
    vision: false,
  },
  // xAI and Groq: list prices from docs.x.ai and console.groq.com, checked on 2026-10-13 for the
  // Nexus AI Hub plan (section 4). Where no cached-input price was listed, the full input price is
  // used, so estimates stay on the high side. xAI bills prompts over 200,000 tokens at double;
  // the budget guard already asks before anything over 100,000 tokens. Vision not confirmed.
  {
    provider: "xai",
    model: "grok-4.7",
    label: "Grok 4.7",
    inputUsdMicrosPerMillion: perMillion(2),
    outputUsdMicrosPerMillion: perMillion(6),
    cachedInputUsdMicrosPerMillion: perMillion(0.5),
    vision: false,
  },
  {
    provider: "xai",
    model: "grok-4.3",
    label: "Grok 4.3",
    inputUsdMicrosPerMillion: perMillion(1.25),
    outputUsdMicrosPerMillion: perMillion(2.5),
    cachedInputUsdMicrosPerMillion: perMillion(1.25),
    vision: false,
  },
  {
    provider: "xai",
    model: "grok-build-0.1",
    label: "Grok Build 0.1",
    inputUsdMicrosPerMillion: perMillion(1),
    outputUsdMicrosPerMillion: perMillion(2),
    cachedInputUsdMicrosPerMillion: perMillion(1),
    vision: false,
  },
  {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    label: "gpt-oss-120b on Groq",
    inputUsdMicrosPerMillion: perMillion(0.15),
    outputUsdMicrosPerMillion: perMillion(0.6),
    cachedInputUsdMicrosPerMillion: perMillion(0.15),
    vision: false,
  },
  {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    label: "gpt-oss-20b on Groq",
    inputUsdMicrosPerMillion: perMillion(0.075),
    outputUsdMicrosPerMillion: perMillion(0.3),
    cachedInputUsdMicrosPerMillion: perMillion(0.075),
    vision: false,
  },
  // OpenRouter: prices from its public model list (openrouter.ai/api/v1/models) on 2026-11-03.
  // ":free" models cost nothing within OpenRouter's caps (about 50 requests a day, 1,000 after a
  // $10 top-up) and may log prompts, so keep client work on paid models. Free lists change: a
  // model that disappears fails the call and the router falls back.
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra (free) on OpenRouter",
    ...FREE,
    vision: false,
  },
  {
    provider: "openrouter",
    model: "cohere/north-mini-code:free",
    label: "Cohere North Mini Code (free) on OpenRouter",
    ...FREE,
    vision: false,
  },
  {
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B (free) on OpenRouter",
    ...FREE,
    vision: true,
  },
  {
    provider: "openrouter",
    model: "qwen/qwen3-coder",
    label: "Qwen3 Coder 480B on OpenRouter",
    inputUsdMicrosPerMillion: perMillion(0.3),
    outputUsdMicrosPerMillion: perMillion(1),
    cachedInputUsdMicrosPerMillion: perMillion(0.1),
    vision: false,
  },
  {
    provider: "openrouter",
    model: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash on OpenRouter",
    inputUsdMicrosPerMillion: perMillion(0.045),
    outputUsdMicrosPerMillion: perMillion(0.5),
    cachedInputUsdMicrosPerMillion: perMillion(0.012),
    vision: true,
  },
  {
    provider: "openrouter",
    model: "z-ai/glm-5.3",
    label: "GLM 5.3 on OpenRouter",
    inputUsdMicrosPerMillion: perMillion(0.08),
    outputUsdMicrosPerMillion: perMillion(3.6),
    cachedInputUsdMicrosPerMillion: perMillion(0.076),
    vision: false,
  },
  {
    provider: "openrouter",
    model: "openai/gpt-oss-120b",
    label: "gpt-oss-120b on OpenRouter",
    inputUsdMicrosPerMillion: perMillion(0.15),
    outputUsdMicrosPerMillion: perMillion(0.6),
    cachedInputUsdMicrosPerMillion: perMillion(0.075),
    vision: false,
  },
  // Cerebras: its pricing page does not list per-token prices in text; these come from public
  // trackers on 2026-11-03 (gpt-oss-120b $0.35/$0.75, qwen-3.8-27b $0.99/$1.49 per million).
  // Re-check in the Cerebras console. No cached-input price is published, so the full input price
  // is used. New accounts get a one-time $5 credit; there is no renewing free tier.
  {
    provider: "cerebras",
    model: "gpt-oss-120b",
    label: "gpt-oss-120b on Cerebras",
    inputUsdMicrosPerMillion: perMillion(0.35),
    outputUsdMicrosPerMillion: perMillion(0.75),
    cachedInputUsdMicrosPerMillion: perMillion(0.35),
    vision: false,
  },
  {
    provider: "cerebras",
    model: "qwen-3.8-27b",
    label: "Qwen 3.8 27B on Cerebras",
    inputUsdMicrosPerMillion: perMillion(0.99),
    outputUsdMicrosPerMillion: perMillion(1.49),
    cachedInputUsdMicrosPerMillion: perMillion(0.99),
    vision: false,
  },
];

export function listedPrice(provider: ProviderId, model: string): TokenPrice | null {
  const found = LISTED_MODELS.find((item) => item.provider === provider && item.model === model);
  if (!found) return null;
  return {
    inputUsdMicrosPerMillion: found.inputUsdMicrosPerMillion,
    outputUsdMicrosPerMillion: found.outputUsdMicrosPerMillion,
    cachedInputUsdMicrosPerMillion: found.cachedInputUsdMicrosPerMillion,
    vision: found.vision,
  };
}

/**
 * Provisional router defaults. They are the two adapters this sprint ships, not winners of the
 * benchmark: no live runs have been scored yet (docs/provider-register/benchmark-results-2026-11-03.md).
 */
export const PROVISIONAL_ROUTES = {
  planning: { provider: "anthropic", model: "claude-sonnet-5-5" },
  routine: { provider: "openai", model: "gpt-6-luna" },
  complex_code: { provider: "anthropic", model: "claude-sonnet-5-5" },
  review: { provider: "openai", model: "gpt-6.1-sol" },
  research: { provider: "openai", model: "gpt-6.1-sol" },
} as const;

/** Tried in order when a provider is down, rate-limited or declines (ADR 0018). */
export const PROVISIONAL_FALLBACKS = [
  { provider: "anthropic" as const, model: "claude-sonnet-5-5" },
  { provider: "openai" as const, model: "gpt-6.1-sol" },
  { provider: "xai" as const, model: "grok-4.3" },
  { provider: "groq" as const, model: "openai/gpt-oss-120b" },
  { provider: "openrouter" as const, model: "qwen/qwen3-coder" },
  { provider: "cerebras" as const, model: "gpt-oss-120b" },
];
