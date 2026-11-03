import { describe, expect, it } from "vitest";
import { createAnthropicAdapter } from "./anthropic";
import { collectOpenAiStream, createOpenAiAdapter } from "./openai";
import { createTemplateAdapter } from "./template";
import { CancelledError, UpstreamError } from "../http";
import type { CompletionRequest } from "../types";

const KEY = "sk-test-secret-key-should-not-leak";

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

const request = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  model: "gpt-6.1-sol",
  messages: [{ role: "user", content: "hi" }],
  maxOutputTokens: 16,
  signal: new AbortController().signal,
  ...over,
});

describe("OpenAI adapter against recorded responses", () => {
  it("returns text, tool calls and usage", async () => {
    const seen: { url: string; authorization: string | null; body: unknown }[] = [];
    const adapter = createOpenAiAdapter({
      apiKey: KEY,
      fetchImpl: async (url, init) => {
        seen.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
          body: JSON.parse(String(init?.body)),
        });
        return jsonResponse({
          id: "chatcmpl_1",
          choices: [
            {
              message: {
                content: "done",
                tool_calls: [
                  { id: "call_1", function: { name: "lookup", arguments: '{"q":"a"}' } },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 5,
            prompt_tokens_details: { cached_tokens: 4 },
          },
        });
      },
    });
    const result = await adapter.complete(
      request({
        tools: [{ name: "lookup", description: "find", inputSchema: { type: "object" } }],
      }),
    );
    expect(result.text).toBe("done");
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "lookup", input: { q: "a" } }]);
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 5, cachedTokens: 4 });
    expect(seen[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.body).toMatchObject({ model: "gpt-6.1-sol", tools: [{ type: "function" }] });
  });

  it("retries a 429 once and then a 500 once", async () => {
    let calls = 0;
    const adapter = createOpenAiAdapter({
      apiKey: KEY,
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("", { status: 429, headers: { "retry-after": "0" } });
        return jsonResponse({
          choices: [{ message: { content: "after-429" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
      },
    });
    await expect(adapter.complete(request())).resolves.toMatchObject({ text: "after-429" });

    calls = 0;
    const failing = createOpenAiAdapter({
      apiKey: KEY,
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return new Response("sk-test-secret-key-should-not-leak", { status: 503 });
      },
    });
    await expect(failing.complete(request())).rejects.toThrow(UpstreamError);
    expect(calls).toBe(2);
    try {
      await failing.complete(request());
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
      expect((error as Error).message).toBe("upstream 503");
    }
  });

  it("stops when the caller cancels", async () => {
    const adapter = createOpenAiAdapter({
      apiKey: KEY,
      fetchImpl: async () => jsonResponse({}),
    });
    await expect(adapter.complete(request({ signal: AbortSignal.abort() }))).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it("reads a streamed reply", async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encode = (text: string) => controller.enqueue(new TextEncoder().encode(text));
        encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
        encode("data: [DONE]\n\n");
        controller.close();
      },
    });
    await expect(collectOpenAiStream(new Response(stream))).resolves.toBe("hi");
  });
});

describe("Anthropic adapter against recorded responses", () => {
  it("sends images as base64 and reads tool use", async () => {
    let body: Record<string, unknown> = {};
    const adapter = createAnthropicAdapter({
      apiKey: KEY,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(new Headers(init?.headers).get("x-api-key")).toBe(KEY);
        return jsonResponse({
          id: "msg_1",
          content: [
            { type: "text", text: "seen" },
            { type: "tool_use", id: "toolu_1", name: "lookup", input: { q: "a" } },
          ],
          usage: { input_tokens: 30, output_tokens: 8, cache_read_input_tokens: 3 },
        });
      },
    });
    const result = await adapter.complete(
      request({
        model: "claude-sonnet-5-5",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "what is this" },
              { type: "image", mediaType: "image/png", dataBase64: "aGk=" },
            ],
          },
        ],
      }),
    );
    expect(result.text).toBe("seen");
    expect(result.toolCalls[0]).toMatchObject({ name: "lookup" });
    expect(result.usage.imageCount).toBe(1);
    const messages = body.messages as {
      content: { type: string; source?: { media_type: string } }[];
    }[];
    expect(messages[0]?.content[1]).toMatchObject({
      type: "image",
      source: { media_type: "image/png" },
    });
  });
});

describe("adapter template", () => {
  it("points DeepSeek at its OpenAI-shaped endpoint and nowhere else", async () => {
    let url = "";
    const adapter = createTemplateAdapter({
      provider: "deepseek",
      apiKey: KEY,
      price: () => ({
        inputUsdMicrosPerMillion: 1,
        outputUsdMicrosPerMillion: 1,
        cachedInputUsdMicrosPerMillion: 0,
        vision: false,
      }),
      fetchImpl: async (target) => {
        url = String(target);
        return jsonResponse({ choices: [{ message: { content: "ok" } }], usage: {} });
      },
    });
    expect(adapter.id).toBe("deepseek");
    await adapter.complete(request({ model: "deepseek-chat" }));
    expect(url).toBe("https://api.deepseek.com/chat/completions");
  });
});

describe("policy refusals are reported as declined (ADR 0018)", () => {
  const reply = (body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  const request = {
    model: "gpt-6.1-sol",
    messages: [{ role: "user" as const, content: "x" }],
    maxOutputTokens: 8,
    signal: new AbortController().signal,
  };

  it("OpenAI: a refusal field or the content filter", async () => {
    const refusal = createOpenAiAdapter({
      apiKey: "k",
      fetchImpl: reply({
        choices: [{ message: { content: null, refusal: "No." }, finish_reason: "stop" }],
      }),
    });
    expect((await refusal.complete(request)).declined).toBe(true);
    const filtered = createOpenAiAdapter({
      apiKey: "k",
      fetchImpl: reply({
        choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
      }),
    });
    expect((await filtered.complete(request)).declined).toBe(true);
    const normal = createOpenAiAdapter({
      apiKey: "k",
      fetchImpl: reply({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }),
    });
    expect((await normal.complete(request)).declined).toBe(false);
  });

  it("Anthropic: stop_reason refusal", async () => {
    const adapter = createAnthropicAdapter({
      apiKey: "k",
      fetchImpl: reply({ content: [{ type: "text", text: "" }], stop_reason: "refusal" }),
    });
    expect((await adapter.complete({ ...request, model: "claude-sonnet-5-5" })).declined).toBe(
      true,
    );
  });
});

describe("xAI and Groq (ADR 0018: more than two providers)", () => {
  it("are callable with their dated prices, and refuse unpriced models", () => {
    const xai = createTemplateAdapter({ provider: "xai", apiKey: "k" });
    expect(xai.price("grok-4.3")).toMatchObject({
      inputUsdMicrosPerMillion: 1_250_000,
      vision: false,
    });
    expect(xai.price("grok-imaginary")).toBeNull();
    const groq = createTemplateAdapter({ provider: "groq", apiKey: "k" });
    expect(groq.price("openai/gpt-oss-20b")).toMatchObject({ outputUsdMicrosPerMillion: 300_000 });
    // Gemini and DeepSeek wait for dated prices: never priced, so never called blind.
    expect(
      createTemplateAdapter({ provider: "gemini", apiKey: "k" }).price("gemini-3-pro"),
    ).toBeNull();
  });

  it("talk to their own endpoints with the key in the header, never the URL", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const request = {
      model: "grok-4.3",
      messages: [{ role: "user" as const, content: "x" }],
      maxOutputTokens: 8,
      signal: new AbortController().signal,
    };
    await createTemplateAdapter({ provider: "xai", apiKey: "xai-secret", fetchImpl }).complete(
      request,
    );
    await createTemplateAdapter({ provider: "groq", apiKey: "gsk-secret", fetchImpl }).complete({
      ...request,
      model: "openai/gpt-oss-120b",
    });
    expect(seen).toEqual([
      { url: "https://api.x.ai/v1/chat/completions", auth: "Bearer xai-secret" },
      { url: "https://api.groq.com/openai/v1/chat/completions", auth: "Bearer gsk-secret" },
    ]);
  });
});
