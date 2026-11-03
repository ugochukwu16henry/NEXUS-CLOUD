/**
 * One gateway for every AI provider, used by both zones (ADR 0015): Nexus Cloud's agents and
 * Nexus AI Hub's Studio, Console and Academy. Each zone creates its own gateway with its own
 * adapters (and so its own provider keys); nothing here is shared at runtime.
 *
 * Every call reports its usage once, through `onUsage`, which is where each zone does its
 * accounting: the Hub captures a wallet hold, Nexus records spend against its budget cap.
 * Nexus Cloud calls go through `createStaffGateway` (routing, budget guard, ledger). This
 * `generateText` path stays for a zone that does its own accounting, such as the Hub.
 */

export type ProviderId =
  "xai" | "groq" | "anthropic" | "openai" | "gemini" | "deepseek" | "openrouter";
export type Zone = "staff" | "customer";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type TextRequest = {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
};

export type TextResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** What the provider charged, in millionths of a US dollar (the unit `@nexus/money` uses). */
  costUsdMicros: number;
  providerRequestId: string | null;
};

export type ProviderAdapter = {
  id: ProviderId;
  generateText(request: Omit<TextRequest, "provider">, signal: AbortSignal): Promise<TextResult>;
};

export type UsageRecord = {
  zone: Zone;
  provider: ProviderId;
  model: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  latencyMs: number;
  error: string | null;
};

export type GatewayOptions = {
  zone: Zone;
  adapters: ProviderAdapter[];
  onUsage: (record: UsageRecord) => void | Promise<void>;
  timeoutMs?: number;
  now?: () => number;
};

export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: ProviderId) {
    super(`provider ${provider} is not configured in this zone`);
  }
}

export type Gateway = {
  readonly zone: Zone;
  generateText(request: TextRequest): Promise<TextResult>;
};

export function createGateway(options: GatewayOptions): Gateway {
  const adapters = new Map(options.adapters.map((adapter) => [adapter.id, adapter]));
  const timeoutMs = options.timeoutMs ?? 60_000;
  const now = options.now ?? Date.now;

  return {
    zone: options.zone,
    async generateText({ provider, ...request }) {
      const adapter = adapters.get(provider);
      if (!adapter) throw new ProviderNotConfiguredError(provider);

      const started = now();
      const base = { zone: options.zone, provider, model: request.model };
      try {
        const result = await adapter.generateText(request, AbortSignal.timeout(timeoutMs));
        await options.onUsage({
          ...base,
          ok: true,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsdMicros: result.costUsdMicros,
          latencyMs: now() - started,
          error: null,
        });
        return result;
      } catch (error) {
        // A failed call is still reported, so dashboards see error rates and no hold is left open.
        await options.onUsage({
          ...base,
          ok: false,
          inputTokens: 0,
          outputTokens: 0,
          costUsdMicros: 0,
          latencyMs: now() - started,
          error: error instanceof Error ? error.name : "Error",
        });
        throw error;
      }
    },
  };
}
