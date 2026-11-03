import type { ProviderId } from "../gateway";
import { postJson, readSse, type FetchLike } from "../http";
import { partsOf } from "../messages";
import { listedPrice } from "../prices";
import { countImages, quoteCost } from "../cost";
import type { Completion, CompletionRequest, StaffAdapter, TokenPrice, ToolCall } from "../types";

type OpenAiMessage = {
  content?: string | null;
  refusal?: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};

function toOpenAiContent(request: CompletionRequest) {
  return request.messages.map((message) => {
    const parts = partsOf(message);
    const images = parts.filter((part) => part.type === "image");
    if (images.length === 0) {
      return {
        role: message.role,
        content: parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
        tool_call_id: message.toolCallId,
      };
    }
    return {
      role: message.role,
      content: parts.map((part) =>
        part.type === "text"
          ? { type: "text", text: part.text }
          : {
              type: "image_url",
              image_url: { url: `data:${part.mediaType};base64,${part.dataBase64}` },
            },
      ),
    };
  });
}

function parseToolInput(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}") as unknown;
  } catch {
    return { raw };
  }
}

function toolCallsOf(message: OpenAiMessage | undefined): ToolCall[] {
  return (message?.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    input: parseToolInput(call.function.arguments),
  }));
}

export function createOpenAiAdapter(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Tests and the local fixture pass a price table. Live calls use the dated register. */
  price?: (model: string) => TokenPrice | null;
  provider?: ProviderId;
}): StaffAdapter {
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const price =
    options.price ?? ((model: string) => listedPrice(options.provider ?? "openai", model));
  const provider = options.provider ?? "openai";

  return {
    id: provider,
    capabilities: { vision: true, tools: true, structuredOutput: true },
    price,
    quote(request) {
      const modelPrice = price(request.model);
      if (!modelPrice)
        return { estimatedUsdMicros: 0, inputTokens: 0, imageCount: countImages(request.messages) };
      return quoteCost(modelPrice, request.messages, request.maxOutputTokens);
    },
    async complete(request) {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: toOpenAiContent(request),
        max_completion_tokens: request.maxOutputTokens,
      };
      if (request.tools?.length) {
        body.tools = request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));
      }
      if (request.jsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: "result", schema: request.jsonSchema },
        };
      }
      const payload = (await postJson({
        url: `${baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${options.apiKey}` },
        body,
        signal: request.signal,
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
      })) as {
        id?: string;
        choices?: { message?: OpenAiMessage; finish_reason?: string }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      const message = payload.choices?.[0]?.message;
      // A policy refusal: an explicit refusal field, or output withheld by the content filter.
      const declined =
        Boolean(message?.refusal) || payload.choices?.[0]?.finish_reason === "content_filter";
      return {
        declined,
        text: message?.content ?? "",
        toolCalls: toolCallsOf(message),
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0,
          cachedTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          imageCount: countImages(request.messages),
        },
        providerRequestId: payload.id ?? null,
      } satisfies Completion;
    },
  };
}

/** Reads an OpenAI chat-completions stream and returns the joined text. Used by the stream test. */
export async function collectOpenAiStream(response: Response): Promise<string> {
  let text = "";
  await readSse(response, (data) => {
    if (data === "[DONE]") return;
    const event = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
    text += event.choices?.[0]?.delta?.content ?? "";
  });
  return text;
}
