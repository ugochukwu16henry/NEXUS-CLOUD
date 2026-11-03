import { describe, expect, it } from "vitest";
import { createStaffGateway, ProviderDeclinedError } from "./complete";
import { listedPrice } from "./prices";
import type { LedgerUsage, RouteChoice, StaffAdapter, TaskKind } from "./types";

// ADR 0018: a provider declining under its own usage policy is that provider's decision, not a
// dead end. The gateway bills the attempt, then tries the next allowed provider, or reports the
// refusal with the providers the owner can try instead.

const routes = {
  planning: { provider: "anthropic", model: "claude-sonnet-5-5" },
  routine: { provider: "openai", model: "gpt-6-luna" },
  complex_code: { provider: "anthropic", model: "claude-sonnet-5-5" },
  review: { provider: "openai", model: "gpt-6.1-sol" },
  research: { provider: "openai", model: "gpt-6.1-sol" },
} as Record<TaskKind, RouteChoice>;
const budget = {
  run: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
  project: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
  global: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
};

function adapter(id: "anthropic" | "openai", declines: boolean): StaffAdapter {
  return {
    id,
    capabilities: { vision: true, tools: true, structuredOutput: true },
    price: (model) => listedPrice(id, model),
    quote: () => ({ estimatedUsdMicros: 10_000, inputTokens: 20, imageCount: 0 }),
    async complete() {
      return {
        text: declines ? "I can't help with that." : `answer from ${id}`,
        toolCalls: [],
        usage: { inputTokens: 1_000, outputTokens: 50, cachedTokens: 0, imageCount: 0 },
        providerRequestId: "req",
        declined: declines,
      };
    },
  };
}

function setup(adapters: StaffAdapter[], allowFallback: boolean) {
  const usage: LedgerUsage[] = [];
  const gateway = createStaffGateway({
    adapters,
    routes,
    fallbacks: [
      { provider: "anthropic", model: "claude-sonnet-5-5" },
      { provider: "openai", model: "gpt-6.1-sol" },
    ],
    allowed: new Set(["anthropic", "openai"]),
    allowFallback,
    budget,
    onUsage: (record) => void usage.push(record),
  });
  return { gateway, usage };
}

const ask = {
  taskKind: "planning" as const,
  messages: [{ role: "user" as const, content: "make a video script" }],
  maxOutputTokens: 32,
};

describe("a provider that declines (ADR 0018)", () => {
  it("is billed, then the request goes to the next allowed provider", async () => {
    const { gateway, usage } = setup([adapter("anthropic", true), adapter("openai", false)], true);
    const result = await gateway.complete(ask);
    expect(result.text).toBe("answer from openai");
    expect(result.fallbackFrom).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(usage.map((row) => [row.provider, row.ok, row.error])).toEqual([
      ["anthropic", false, "ProviderDeclined"],
      ["openai", true, null],
    ]);
    expect(usage[0]!.costUsdMicros).toBeGreaterThan(0); // the refused attempt still cost tokens
  });

  it("without fallback, reports the refusal and the providers the owner can try instead", async () => {
    const { gateway } = setup([adapter("anthropic", true), adapter("openai", false)], false);
    const error = (await gateway.complete(ask).catch((e: unknown) => e)) as ProviderDeclinedError;
    expect(error).toBeInstanceOf(ProviderDeclinedError);
    expect(error.provider).toBe("anthropic");
    expect(error.alternatives).toContainEqual({ provider: "openai", model: "gpt-6.1-sol" });
    expect(error.alternatives).not.toContainEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
  });

  it("when every provider declines, the last refusal is reported, never hidden", async () => {
    const { gateway, usage } = setup([adapter("anthropic", true), adapter("openai", true)], true);
    await expect(gateway.complete(ask)).rejects.toBeInstanceOf(ProviderDeclinedError);
    expect(usage).toHaveLength(2);
  });

  it("an owner's manual choice of another provider is honoured", async () => {
    const { gateway } = setup([adapter("anthropic", true), adapter("openai", false)], false);
    const result = await gateway.complete({
      ...ask,
      manual: { provider: "openai", model: "gpt-6.1-sol" },
    });
    expect(result.provider).toBe("openai");
    expect(result.fallbackFrom).toBeNull();
  });
});
