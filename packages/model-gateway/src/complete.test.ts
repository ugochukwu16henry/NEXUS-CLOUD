import { describe, expect, it } from "vitest";
import { BudgetExceededError } from "./budget";
import { createStaffGateway, VisionUnsupportedError } from "./complete";
import { UpstreamError } from "./http";
import { listedPrice } from "./prices";
import { RouteBlockedError } from "./router";
import type { Completion, LedgerUsage, RouteChoice, StaffAdapter, TaskKind } from "./types";

const routes = {
  planning: { provider: "anthropic", model: "claude-sonnet-5-5" },
  routine: { provider: "openai", model: "gpt-6-luna" },
  complex_code: { provider: "anthropic", model: "claude-sonnet-5-5" },
  review: { provider: "openai", model: "gpt-6.1-sol" },
  research: { provider: "openai", model: "gpt-6.1-sol" },
} as Record<TaskKind, RouteChoice>;

const openBudget = {
  run: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
  project: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
  global: { spentUsdMicros: 0, limitUsdMicros: 1_000_000, extended: false },
};

function scripted(
  id: StaffAdapter["id"],
  model: string,
  replies: Completion["text"][] | { fail: number },
): StaffAdapter {
  let calls = 0;
  return {
    id,
    capabilities: { vision: true, tools: true, structuredOutput: true },
    price: (asked) => (asked === model ? listedPrice(id, model) : null),
    quote: () => ({ estimatedUsdMicros: 10_000, inputTokens: 20, imageCount: 0 }),
    async complete() {
      calls += 1;
      if (!Array.isArray(replies)) {
        if (calls <= replies.fail) throw new UpstreamError(503);
      }
      const text = Array.isArray(replies) ? (replies[calls - 1] ?? replies.at(-1) ?? "") : "";
      return {
        text,
        toolCalls: [],
        usage: { inputTokens: 1_000, outputTokens: 100, cachedTokens: 0, imageCount: 0 },
        providerRequestId: "req",
      };
    },
  };
}

function setup(
  adapters: StaffAdapter[],
  over: { allowFallback?: boolean; budget?: typeof openBudget } = {},
) {
  const usage: LedgerUsage[] = [];
  let clock = 0;
  const gateway = createStaffGateway({
    adapters,
    routes,
    fallbacks: [
      { provider: "anthropic", model: "claude-sonnet-5-5" },
      { provider: "openai", model: "gpt-6.1-sol" },
    ],
    allowed: new Set(["anthropic", "openai"]),
    allowFallback: over.allowFallback ?? false,
    budget: over.budget ?? openBudget,
    onUsage: (record) => void usage.push(record),
    now: () => (clock += 5),
  });
  return { gateway, usage };
}

const ask = {
  taskKind: "planning" as const,
  messages: [{ role: "user" as const, content: "hi" }],
  maxOutputTokens: 32,
};

describe("staff gateway", () => {
  it("prices the call from the register and records usage once", async () => {
    const { gateway, usage } = setup([scripted("anthropic", "claude-sonnet-5-5", ["hello"])]);
    const started = performance.now();
    const result = await gateway.complete(ask);
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.text).toBe("hello");
    expect(result.costUsdMicros).toBe(1_000 * 2 + 100 * 10);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      ok: true,
      provider: "anthropic",
      error: null,
      costUsdMicros: 3000,
    });
  });

  it("stops at the cap before the provider is contacted", async () => {
    let calls = 0;
    const adapter = scripted("anthropic", "claude-sonnet-5-5", ["nope"]);
    const original = adapter.complete.bind(adapter);
    adapter.complete = async (request) => {
      calls += 1;
      return original(request);
    };
    const { gateway, usage } = setup([adapter], {
      budget: {
        ...openBudget,
        project: { spentUsdMicros: 0, limitUsdMicros: 10_000, extended: false },
      },
    });
    await expect(gateway.complete(ask)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(calls).toBe(0);
    expect(usage).toEqual([]);
  });

  it("warns at 50% and still returns the reply", async () => {
    const { gateway } = setup([scripted("anthropic", "claude-sonnet-5-5", ["ok"])], {
      budget: {
        ...openBudget,
        project: { spentUsdMicros: 0, limitUsdMicros: 20_000, extended: false },
      },
    });
    const result = await gateway.complete(ask);
    expect(result.warnings).toEqual([{ scope: "project", percent: 50 }]);
  });

  it("refuses to send an image to a model without vision", async () => {
    const luna = scripted("openai", "gpt-6-luna", ["seen"]);
    luna.quote = () => ({ estimatedUsdMicros: 1, inputTokens: 1600, imageCount: 1 });
    const { gateway, usage } = setup([
      luna,
      scripted("anthropic", "claude-sonnet-5-5", ["unused"]),
    ]);
    await expect(
      gateway.complete({
        taskKind: "routine",
        maxOutputTokens: 16,
        messages: [
          {
            role: "user",
            content: [{ type: "image", mediaType: "image/png", dataBase64: "aGk=" }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(VisionUnsupportedError);
    expect(usage).toEqual([]);
  });

  it("does not fall back when the project forbids it", async () => {
    const { gateway, usage } = setup(
      [
        scripted("anthropic", "claude-sonnet-5-5", { fail: 1 }),
        scripted("openai", "gpt-6.1-sol", ["backup"]),
      ],
      { allowFallback: false },
    );
    await expect(gateway.complete(ask)).rejects.toBeInstanceOf(RouteBlockedError);
    expect(usage.map((row) => row.provider)).toEqual(["anthropic"]);
    expect(JSON.stringify(usage)).not.toContain("sk-");
  });

  it("switches provider when fallback is allowed and says which model it left", async () => {
    const { gateway, usage } = setup(
      [
        scripted("anthropic", "claude-sonnet-5-5", { fail: 1 }),
        scripted("openai", "gpt-6.1-sol", ["backup"]),
      ],
      { allowFallback: true },
    );
    const result = await gateway.complete(ask);
    expect(result.text).toBe("backup");
    expect(result.fallbackFrom).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(usage.map((row) => [row.provider, row.ok])).toEqual([
      ["anthropic", false],
      ["openai", true],
    ]);
  });

  it("retries a schema-invalid reply once, then fails", async () => {
    const { gateway, usage } = setup([
      scripted("anthropic", "claude-sonnet-5-5", ["nope", "still nope"]),
    ]);
    await expect(
      gateway.complete({ ...ask, jsonSchema: { type: "object", required: ["ok"] } }),
    ).rejects.toThrow(/schema/);
    expect(usage).toHaveLength(2);

    const again = setup([scripted("anthropic", "claude-sonnet-5-5", ["nope", '{"ok":true}'])]);
    const result = await again.gateway.complete({
      ...ask,
      jsonSchema: { type: "object", required: ["ok"] },
    });
    expect(result.parsed).toEqual({ ok: true });
  });

  it("asks before an expensive context", async () => {
    const adapter = scripted("anthropic", "claude-sonnet-5-5", ["long"]);
    adapter.quote = () => ({ estimatedUsdMicros: 1, inputTokens: 100_000, imageCount: 0 });
    const { gateway } = setup([adapter]);
    await expect(gateway.complete(ask)).rejects.toThrow(/large_context/);
    const allowed = await gateway.complete({ ...ask, allowExpensive: true });
    expect(allowed.text).toBe("long");
  });
});
