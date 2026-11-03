import { costUsdMicros } from "./cost";
import { evaluateBudget, type BudgetSnapshot, type BudgetWarning } from "./budget";
import { CancelledError, UpstreamError } from "./http";
import { parseStructured, SchemaError } from "./schema";
import { chooseRoute, RouteBlockedError } from "./router";
import type { ProviderId } from "./gateway";
import type {
  Completion,
  CompletionRequest,
  GatewayMessage,
  LedgerUsage,
  ObjectSchema,
  RouteChoice,
  StaffAdapter,
  TaskKind,
  ToolSpec,
} from "./types";

export class VisionUnsupportedError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly model: string,
  ) {
    super(`${provider}/${model} cannot read images`);
    this.name = "VisionUnsupportedError";
  }
}

/** The provider declined under its own usage policy; another provider may accept (ADR 0018). */
export class ProviderDeclinedError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly model: string,
    /** Other configured providers the owner can try with one click. */
    readonly alternatives: RouteChoice[] = [],
  ) {
    super(`${provider}/${model} declined the request`);
    this.name = "ProviderDeclinedError";
  }
}

export class UnknownModelError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly model: string,
  ) {
    super(`no price for ${provider}/${model}`);
    this.name = "UnknownModelError";
  }
}

export type StaffRequest = {
  taskKind: TaskKind;
  messages: GatewayMessage[];
  maxOutputTokens: number;
  manual?: RouteChoice | null;
  tools?: ToolSpec[];
  jsonSchema?: ObjectSchema;
  allowExpensive?: boolean;
  loopIterations?: number;
  signal?: AbortSignal;
};

export type StaffResult = {
  text: string;
  parsed: unknown | null;
  toolCalls: Completion["toolCalls"];
  provider: ProviderId;
  model: string;
  fallbackFrom: RouteChoice | null;
  warnings: BudgetWarning[];
  costUsdMicros: number;
  usage: Completion["usage"];
  providerRequestId: string | null;
};

export type StaffGatewayOptions = {
  adapters: StaffAdapter[];
  routes: Record<TaskKind, RouteChoice>;
  fallbacks: RouteChoice[];
  allowed: ReadonlySet<ProviderId>;
  allowFallback: boolean;
  budget: BudgetSnapshot;
  onUsage: (record: LedgerUsage) => void | Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};

function isFallbackEligible(error: unknown): boolean {
  if (error instanceof ProviderDeclinedError) return true;
  return error instanceof UpstreamError && (error.status === 429 || error.status >= 500);
}

export function createStaffGateway(options: StaffGatewayOptions) {
  const adapters = new Map(options.adapters.map((adapter) => [adapter.id, adapter]));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 60_000;

  async function call(
    adapter: StaffAdapter,
    request: CompletionRequest,
    route: RouteChoice,
    fallbackFrom: RouteChoice | null,
  ): Promise<Completion> {
    const started = now();
    try {
      const result = await adapter.complete(request);
      const price = adapter.price(route.model);
      if (!price) throw new UnknownModelError(route.provider, route.model);
      const cost = costUsdMicros(price, result.usage);
      await options.onUsage({
        provider: route.provider,
        model: route.model,
        ok: !result.declined,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedTokens: result.usage.cachedTokens,
        imageCount: result.usage.imageCount,
        costUsdMicros: cost,
        latencyMs: Math.max(0, now() - started),
        error: result.declined ? "ProviderDeclined" : null,
        fallbackFrom,
        providerRequestId: result.providerRequestId,
      });
      if (result.declined) throw new ProviderDeclinedError(route.provider, route.model);
      return result;
    } catch (error) {
      if (error instanceof UnknownModelError || error instanceof ProviderDeclinedError) throw error;
      await options.onUsage({
        provider: route.provider,
        model: route.model,
        ok: false,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        imageCount: 0,
        costUsdMicros: 0,
        latencyMs: Math.max(0, now() - started),
        error: error instanceof Error ? error.name : "Error",
        fallbackFrom,
        providerRequestId: null,
      });
      throw error;
    }
  }

  /** Every other priced model on a configured, allowed provider: the "try another" choices. */
  function alternativesTo(provider: ProviderId, model: string): RouteChoice[] {
    const seen = new Set<string>();
    return [...Object.values(options.routes), ...options.fallbacks].filter((route) => {
      const key = `${route.provider}/${route.model}`;
      if (seen.has(key) || (route.provider === provider && route.model === model)) return false;
      seen.add(key);
      const adapter = adapters.get(route.provider);
      return Boolean(adapter?.price(route.model)) && options.allowed.has(route.provider);
    });
  }

  function withAlternatives(error: unknown): unknown {
    return error instanceof ProviderDeclinedError
      ? new ProviderDeclinedError(
          error.provider,
          error.model,
          alternativesTo(error.provider, error.model),
        )
      : error;
  }

  return {
    configured: new Set(adapters.keys()),
    async complete(input: StaffRequest): Promise<StaffResult> {
      const configured = new Set(adapters.keys());
      let choice = chooseRoute({
        taskKind: input.taskKind,
        routes: options.routes,
        fallbacks: options.fallbacks,
        manual: input.manual,
        allowed: options.allowed,
        configured,
        allowFallback: options.allowFallback,
        primaryFailed: false,
      });
      const adapterFor = (provider: ProviderId) => {
        const found = adapters.get(provider);
        if (!found) throw new RouteBlockedError("no_route");
        return found;
      };
      let adapter = adapterFor(choice.route.provider);

      const price = adapter.price(choice.route.model);
      if (!price) throw new UnknownModelError(choice.route.provider, choice.route.model);
      const quote = adapter.quote({
        model: choice.route.model,
        messages: input.messages,
        maxOutputTokens: input.maxOutputTokens,
        tools: input.tools,
        jsonSchema: input.jsonSchema,
        signal: new AbortController().signal,
      });
      if (quote.imageCount > 0 && (!adapter.capabilities.vision || !price.vision)) {
        throw new VisionUnsupportedError(choice.route.provider, choice.route.model);
      }

      const { warnings } = evaluateBudget({
        snapshot: options.budget,
        estimatedUsdMicros: quote.estimatedUsdMicros,
        inputTokens: quote.inputTokens,
        imageCount: quote.imageCount,
        loopIterations: input.loopIterations,
        allowExpensive: input.allowExpensive,
      });

      const signal = input.signal ?? AbortSignal.timeout(timeoutMs);
      const request: CompletionRequest = {
        model: choice.route.model,
        messages: input.messages,
        maxOutputTokens: input.maxOutputTokens,
        tools: input.tools,
        jsonSchema: input.jsonSchema,
        signal,
      };

      let result: Completion;
      try {
        result = await call(adapter, request, choice.route, choice.fallbackFrom);
      } catch (error) {
        if (!isFallbackEligible(error) || choice.fallbackFrom) throw withAlternatives(error);
        let retry: ReturnType<typeof chooseRoute>;
        try {
          retry = chooseRoute({
            taskKind: input.taskKind,
            routes: options.routes,
            fallbacks: options.fallbacks,
            manual: input.manual,
            allowed: options.allowed,
            configured,
            allowFallback: options.allowFallback,
            primaryFailed: true,
          });
        } catch (routeError) {
          // A refusal with nowhere to fall back to: report the refusal, not the routing.
          if (error instanceof ProviderDeclinedError) throw withAlternatives(error);
          throw routeError;
        }
        const next = adapterFor(retry.route.provider);
        if (quote.imageCount > 0 && !next.price(retry.route.model)?.vision) throw error;
        choice = retry;
        adapter = next;
        try {
          result = await call(
            adapter,
            { ...request, model: retry.route.model },
            retry.route,
            retry.fallbackFrom,
          );
        } catch (retryError) {
          throw withAlternatives(retryError);
        }
      }

      let parsed: unknown | null = null;
      if (input.jsonSchema) {
        try {
          parsed = parseStructured(result.text, input.jsonSchema);
        } catch (error) {
          if (!(error instanceof SchemaError)) throw error;
          const reminder: GatewayMessage = {
            role: "user",
            content: "The previous reply was not valid JSON for the schema. Reply with JSON only.",
          };
          result = await call(
            adapter,
            { ...request, model: choice.route.model, messages: [...input.messages, reminder] },
            choice.route,
            choice.fallbackFrom,
          );
          parsed = parseStructured(result.text, input.jsonSchema);
        }
      }

      const modelPrice = adapter.price(choice.route.model);
      if (!modelPrice) throw new UnknownModelError(choice.route.provider, choice.route.model);
      return {
        text: result.text,
        parsed,
        toolCalls: result.toolCalls,
        provider: choice.route.provider,
        model: choice.route.model,
        fallbackFrom: choice.fallbackFrom,
        warnings,
        costUsdMicros: costUsdMicros(modelPrice, result.usage),
        usage: result.usage,
        providerRequestId: result.providerRequestId,
      };
    },
  };
}

export { CancelledError };
