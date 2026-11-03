import { countImages, quoteCost } from "../cost";
import { postJson, type FetchLike } from "../http";
import { partsOf, textOf } from "../messages";
import { listedPrice } from "../prices";
import type { Completion, StaffAdapter, TokenPrice, ToolCall } from "../types";

type AnthropicBlock =
  { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

export function createAnthropicAdapter(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  price?: (model: string) => TokenPrice | null;
}): StaffAdapter {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
  const price = options.price ?? ((model: string) => listedPrice("anthropic", model));

  return {
    id: "anthropic",
    capabilities: { vision: true, tools: true, structuredOutput: true },
    price,
    quote(request) {
      const modelPrice = price(request.model);
      if (!modelPrice) {
        return { estimatedUsdMicros: 0, inputTokens: 0, imageCount: countImages(request.messages) };
      }
      return quoteCost(modelPrice, request.messages, request.maxOutputTokens);
    },
    async complete(request) {
      const system = request.messages
        .filter((message) => message.role === "system")
        .map((message) => textOf(message))
        .join("\n");
      const messages = request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: partsOf(message).map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : {
                  type: "image",
                  source: { type: "base64", media_type: part.mediaType, data: part.dataBase64 },
                },
          ),
        }));
      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.maxOutputTokens,
        messages,
      };
      if (system) body.system = system;
      if (request.tools?.length) {
        body.tools = request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }));
      }
      const payload = (await postJson({
        url: `${baseUrl}/messages`,
        headers: {
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: request.signal,
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
      })) as {
        id?: string;
        content?: AnthropicBlock[];
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
      };
      const blocks = payload.content ?? [];
      const toolCalls: ToolCall[] = blocks
        .filter(
          (block): block is Extract<AnthropicBlock, { type: "tool_use" }> =>
            block.type === "tool_use",
        )
        .map((block) => ({ id: block.id, name: block.name, input: block.input }));
      return {
        // Anthropic reports a policy refusal as stop_reason "refusal".
        declined: payload.stop_reason === "refusal",
        text: blocks
          .filter(
            (block): block is Extract<AnthropicBlock, { type: "text" }> => block.type === "text",
          )
          .map((block) => block.text)
          .join(""),
        toolCalls,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
          cachedTokens: payload.usage?.cache_read_input_tokens ?? 0,
          imageCount: countImages(request.messages),
        },
        providerRequestId: payload.id ?? null,
      } satisfies Completion;
    },
  };
}
