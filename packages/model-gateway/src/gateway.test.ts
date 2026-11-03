import { describe, expect, it } from "vitest";
import {
  createGateway,
  ProviderNotConfiguredError,
  type ProviderAdapter,
  type UsageRecord,
} from "./gateway";

const echo: ProviderAdapter = {
  id: "groq",
  async generateText(request) {
    return {
      text: `echo: ${request.messages.at(-1)?.content}`,
      inputTokens: 2000,
      outputTokens: 1500,
      costUsdMicros: 1200,
      providerRequestId: "req_1",
    };
  },
};

const failing: ProviderAdapter = {
  id: "xai",
  async generateText() {
    throw new TypeError("upstream 503");
  },
};

function setup(adapters: ProviderAdapter[]) {
  const usage: UsageRecord[] = [];
  let clock = 0;
  const gateway = createGateway({
    zone: "customer",
    adapters,
    onUsage: (record) => void usage.push(record),
    now: () => (clock += 250),
  });
  return { gateway, usage };
}

const request = {
  model: "openai/gpt-oss-120b",
  messages: [{ role: "user" as const, content: "hi" }],
  maxOutputTokens: 1500,
};

describe("model gateway", () => {
  it("routes to the provider's adapter and reports usage once", async () => {
    const { gateway, usage } = setup([echo]);
    const result = await gateway.generateText({ provider: "groq", ...request });

    expect(result.text).toBe("echo: hi");
    expect(usage).toEqual([
      {
        zone: "customer",
        provider: "groq",
        model: "openai/gpt-oss-120b",
        ok: true,
        inputTokens: 2000,
        outputTokens: 1500,
        costUsdMicros: 1200,
        latencyMs: 250,
        error: null,
      },
    ]);
  });

  it("reports a failed call with no cost and rethrows", async () => {
    const { gateway, usage } = setup([failing]);
    await expect(gateway.generateText({ provider: "xai", ...request })).rejects.toThrow(
      "upstream 503",
    );
    expect(usage).toMatchObject([
      { provider: "xai", ok: false, costUsdMicros: 0, error: "TypeError" },
    ]);
  });

  it("refuses a provider this zone has no keys for", async () => {
    const { gateway, usage } = setup([echo]);
    await expect(
      gateway.generateText({ provider: "anthropic", ...request }),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    expect(usage).toEqual([]);
  });
});
