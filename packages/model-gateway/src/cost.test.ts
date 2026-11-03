import { describe, expect, it } from "vitest";
import { costUsdMicros, quoteCost } from "./cost";
import { listedPrice } from "./prices";

const sonnet = listedPrice("anthropic", "claude-sonnet-5-5")!;

describe("cost calculator", () => {
  it("prices fresh input, cached input and output from the dated list", () => {
    // 1,000 fresh input at $2/M = 2,000 micros; 1,000 cached at $0.10/M = 100; 500 output at $10/M = 5,000.
    expect(
      costUsdMicros(sonnet, { inputTokens: 2_000, outputTokens: 500, cachedTokens: 1_000 }),
    ).toBe(7_100);
  });

  it("rounds up to the next micro-dollar", () => {
    expect(costUsdMicros(sonnet, { inputTokens: 1, outputTokens: 0, cachedTokens: 0 })).toBe(2);
  });

  it("counts an image in the pre-call quote", () => {
    const quote = quoteCost(
      sonnet,
      [{ role: "user", content: [{ type: "image", mediaType: "image/png", dataBase64: "aGk=" }] }],
      0,
    );
    expect(quote.imageCount).toBe(1);
    expect(quote.inputTokens).toBe(1600);
    expect(quote.estimatedUsdMicros).toBe(3200);
  });
});
