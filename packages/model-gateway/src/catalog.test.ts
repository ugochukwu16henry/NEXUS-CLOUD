import { describe, expect, it } from "vitest";
import { ADAPTER_TEMPLATE, createTemplateAdapter } from "./adapters/template";
import { PROVIDER_CATALOG, PROVIDER_IDS } from "./catalog";
import { LISTED_MODELS, PROVISIONAL_FALLBACKS, listedPrice } from "./prices";
import { adaptersFromKeys } from "./project";

describe("provider catalog", () => {
  it("lists every provider once, each with an adapter", () => {
    expect(PROVIDER_CATALOG.map((provider) => provider.id)).toEqual([...PROVIDER_IDS]);
    for (const id of PROVIDER_IDS) {
      if (id === "anthropic" || id === "openai") continue;
      expect(ADAPTER_TEMPLATE).toHaveProperty(id);
    }
  });

  it("prices every listed model and every fallback; free models cost nothing", () => {
    for (const model of LISTED_MODELS) {
      expect(PROVIDER_IDS).toContain(model.provider);
      if (model.free) {
        expect(model.inputUsdMicrosPerMillion + model.outputUsdMicrosPerMillion).toBe(0);
      } else {
        expect(model.outputUsdMicrosPerMillion).toBeGreaterThan(0);
      }
    }
    for (const fallback of PROVISIONAL_FALLBACKS) {
      expect(listedPrice(fallback.provider, fallback.model)).not.toBeNull();
    }
    expect(LISTED_MODELS.some((model) => model.provider === "openrouter" && model.free)).toBe(true);
    expect(LISTED_MODELS.some((model) => model.provider === "cerebras")).toBe(true);
  });

  it("turns on OpenRouter and Cerebras from their keys", () => {
    const ids = adaptersFromKeys({ OPENROUTER_API_KEY: "or-key", CEREBRAS_API_KEY: "cb-key" }).map(
      (adapter) => adapter.id,
    );
    expect(ids).toEqual(["openrouter", "cerebras"]);
    expect(adaptersFromKeys({})).toEqual([]);
  });

  it.each([
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", "qwen/qwen3-coder"],
    ["cerebras", "https://api.cerebras.ai/v1/chat/completions", "gpt-oss-120b"],
  ] as const)(
    "%s calls its OpenAI-shaped endpoint with the model id",
    async (provider, url, model) => {
      const calls: { url: string; body: { model: string }; auth: string | null }[] = [];
      const adapter = createTemplateAdapter({
        provider,
        apiKey: "test-key",
        fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
          calls.push({
            url: String(input),
            body: JSON.parse(String(init?.body)) as { model: string },
            auth: new Headers(init?.headers).get("authorization"),
          });
          return new Response(
            JSON.stringify({
              id: "r1",
              choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
              usage: { prompt_tokens: 3, completion_tokens: 1 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }) as typeof fetch,
      });
      const result = await adapter.complete({
        model,
        messages: [{ role: "user", content: "hello" }],
        maxOutputTokens: 16,
        signal: new AbortController().signal,
      });
      expect(result.text).toBe("hi");
      expect(calls[0]).toMatchObject({ url, body: { model }, auth: "Bearer test-key" });
    },
  );
});
