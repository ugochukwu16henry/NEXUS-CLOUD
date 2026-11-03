import type { ProviderId } from "./gateway";

/** Task types the router has a default model for (ADR 0008). */
export const TASK_KINDS = ["planning", "routine", "complex_code", "review", "research"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type TextPart = { type: "text"; text: string };
export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
export type ImagePart = { type: "image"; mediaType: ImageMediaType; dataBase64: string };
export type ContentPart = TextPart | ImagePart;

export type GatewayMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  toolCallId?: string;
};

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** The subset of JSON Schema the gateway checks locally (object + required keys). */
export type ObjectSchema = {
  type: "object";
  required?: string[];
  properties?: Record<string, { type?: string }>;
};

/** USD micros per 1,000,000 tokens. Integers, so estimates don't depend on binary floats. */
export type TokenPrice = {
  inputUsdMicrosPerMillion: number;
  outputUsdMicrosPerMillion: number;
  cachedInputUsdMicrosPerMillion: number;
  vision: boolean;
};

export type CompletionUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  imageCount: number;
};

export type ToolCall = { id: string; name: string; input: unknown };

export type CompletionRequest = {
  model: string;
  messages: GatewayMessage[];
  maxOutputTokens: number;
  tools?: ToolSpec[];
  jsonSchema?: ObjectSchema;
  signal: AbortSignal;
};

export type Completion = {
  text: string;
  toolCalls: ToolCall[];
  usage: CompletionUsage;
  providerRequestId: string | null;
  /**
   * The provider refused the request under its own usage policy (ADR 0018). It may still have
   * charged for the tokens, so the call is billed, then routed elsewhere or reported.
   */
  declined?: boolean;
};

export type Quote = {
  estimatedUsdMicros: number;
  inputTokens: number;
  imageCount: number;
};

export type StaffAdapter = {
  id: ProviderId;
  capabilities: { vision: boolean; tools: boolean; structuredOutput: boolean };
  price(model: string): TokenPrice | null;
  /** Worst-case cost used by the budget guard before the provider is contacted. */
  quote(request: CompletionRequest): Quote;
  complete(request: CompletionRequest): Promise<Completion>;
};

export type RouteChoice = { provider: ProviderId; model: string };

export type LedgerUsage = {
  provider: ProviderId;
  model: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  imageCount: number;
  costUsdMicros: number;
  latencyMs: number;
  error: string | null;
  fallbackFrom: RouteChoice | null;
  providerRequestId: string | null;
};
