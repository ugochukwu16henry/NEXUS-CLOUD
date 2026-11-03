import type { ProviderId } from "../gateway";
import { listedPrice } from "../prices";
import { createOpenAiAdapter } from "./openai";
import type { FetchLike } from "../http";
import type { StaffAdapter, TokenPrice } from "../types";

/**
 * Gemini, xAI, DeepSeek, Groq and OpenRouter all expose an OpenAI-shaped chat endpoint. A model
 * is callable only once it has a dated price in prices.ts (xAI and Groq do, from 2026-10-13);
 * do not invent prices. Without one the gateway refuses the call rather than spend blind.
 */
export const ADAPTER_TEMPLATE = {
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  xai: { baseUrl: "https://api.x.ai/v1" },
  deepseek: { baseUrl: "https://api.deepseek.com" },
  groq: { baseUrl: "https://api.groq.com/openai/v1" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1" },
} as const;

export type TemplateProvider = keyof typeof ADAPTER_TEMPLATE;

export function createTemplateAdapter(options: {
  provider: TemplateProvider;
  apiKey: string;
  fetchImpl?: FetchLike;
  price?: (model: string) => TokenPrice | null;
}): StaffAdapter {
  return createOpenAiAdapter({
    apiKey: options.apiKey,
    baseUrl: ADAPTER_TEMPLATE[options.provider].baseUrl,
    fetchImpl: options.fetchImpl,
    price: options.price ?? ((model: string) => listedPrice(options.provider, model)),
    provider: options.provider satisfies ProviderId,
  });
}
