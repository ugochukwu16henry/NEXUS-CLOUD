import { describe, expect, it } from "vitest";
import { BudgetExceededError, evaluateBudget, singleScope } from "./budget";

const limit = 10_000;

function at(percent: number) {
  return evaluateBudget({
    snapshot: singleScope("project", 0, limit),
    estimatedUsdMicros: Math.round((limit * percent) / 100),
    inputTokens: 10,
    imageCount: 0,
  });
}

describe("budget guard boundaries", () => {
  it("allows 49.9% with no warning", () => {
    expect(at(49.9).warnings).toEqual([]);
  });

  it("warns at 50%", () => {
    expect(at(50).warnings).toEqual([{ scope: "project", percent: 50 }]);
  });

  it("warns at 75%", () => {
    expect(at(75).warnings).toEqual([{ scope: "project", percent: 75 }]);
  });

  it("warns at 90%", () => {
    expect(at(90).warnings).toEqual([{ scope: "project", percent: 90 }]);
  });

  it("allows 99.9% with the 90% warning", () => {
    expect(at(99.9).warnings).toEqual([{ scope: "project", percent: 90 }]);
  });

  it("stops at 100%", () => {
    expect(() => at(100)).toThrow(BudgetExceededError);
  });

  it("asks before a large context, a batch of images, or a long loop", () => {
    const base = {
      snapshot: singleScope("run", 0, limit),
      estimatedUsdMicros: 1,
      inputTokens: 10,
      imageCount: 0,
    };
    expect(() => evaluateBudget({ ...base, inputTokens: 100_000 })).toThrow(/large_context/);
    expect(() => evaluateBudget({ ...base, imageCount: 8 })).toThrow(/image_batch/);
    expect(() => evaluateBudget({ ...base, loopIterations: 5 })).toThrow(/long_loop/);
    expect(
      evaluateBudget({ ...base, inputTokens: 100_000, allowExpensive: true }).warnings,
    ).toEqual([]);
  });

  it("lets a call through after the owner extends the stop", () => {
    const snapshot = singleScope("global", limit, limit);
    snapshot.global.extended = true;
    expect(
      evaluateBudget({ snapshot, estimatedUsdMicros: 1, inputTokens: 1, imageCount: 0 }).warnings,
    ).toEqual([]);
  });
});
