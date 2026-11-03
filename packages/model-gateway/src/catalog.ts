import type { ProviderId } from "./gateway";

/**
 * Every provider Nexus can route to, with how it is paid for (checked 2026-11-03; providers change
 * free tiers without notice, so re-check before relying on one):
 * - free: a standing free tier that renews (with daily or per-minute caps);
 * - trial: one-time credits, then paid;
 * - paid: no free use.
 * A provider is callable once its key is set on the server and its models have dated prices in
 * prices.ts; the owner then allows or blocks it per project (ADR 0018).
 */
export type ProviderAccess = "free" | "trial" | "paid";

export const PROVIDER_IDS = [
  "anthropic",
  "openai",
  "gemini",
  "xai",
  "deepseek",
  "groq",
  "openrouter",
  "cerebras",
] as const satisfies readonly ProviderId[];

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyEnv: string;
  access: ProviderAccess;
  note: string;
};

export const PROVIDER_CATALOG: readonly ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    access: "paid",
    note: "Claude models.",
  },
  {
    id: "openai",
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    access: "paid",
    note: "GPT models; also the second choice for voice transcription.",
  },
  {
    id: "gemini",
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    access: "free",
    note: "Free tier in Google AI Studio; free-tier prompts may be used by Google. No dated prices in Nexus yet, so not callable.",
  },
  {
    id: "xai",
    label: "xAI",
    keyEnv: "XAI_API_KEY",
    access: "paid",
    note: "Grok models.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    access: "paid",
    note: "Very low prices. Reach DeepSeek V4 through OpenRouter today; no direct prices in Nexus yet.",
  },
  {
    id: "groq",
    label: "Groq",
    keyEnv: "GROQ_API_KEY",
    access: "free",
    note: "Free tier with per-minute and daily caps; fast open models and Whisper voice transcription.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyEnv: "OPENROUTER_API_KEY",
    access: "free",
    note: "One key for hundreds of models. Models marked Free cost nothing (about 50 requests a day, 1,000 after a $10 top-up) and may log prompts: keep client work on paid models.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    access: "trial",
    note: "Very fast. A one-time $5 credit for 30 days after adding a card, then paid per token.",
  },
];

export const PROVIDER_LABELS: Record<ProviderId, string> = Object.fromEntries(
  PROVIDER_CATALOG.map((provider) => [provider.id, provider.label]),
) as Record<ProviderId, string>;

export const ACCESS_LABELS: Record<ProviderAccess, string> = {
  free: "Free tier",
  trial: "Free trial",
  paid: "Paid",
};
