import { describe, expect, it } from "vitest";
import { marginGuard } from "./sample";

describe("Owner Dashboard margin guard", () => {
  it("matches the Hub plan's margins (section 6) at the planning rate", () => {
    const byName = Object.fromEntries(marginGuard().map((row) => [row.name, row]));
    // Plan: Video Standard ₦900 → 57%, Student question ₦10 → 89%, Expert request ₦100 → 79%.
    expect(byName["Video Standard · 5 s"]).toMatchObject({
      retailKobo: 90_000,
      belowMinimum: false,
    });
    expect(Math.round(byName["Video Standard · 5 s"]!.marginBp / 100)).toBe(57);
    expect(Math.round(byName["Student question"]!.marginBp / 100)).toBe(89);
    expect(Math.round(byName["Expert request"]!.marginBp / 100)).toBe(79);
  });

  it("flags products under 40% when the Naira weakens", () => {
    const flagged = marginGuard("3000.00").filter((row) => row.belowMinimum);
    expect(flagged.map((row) => row.name)).toContain("Video Standard · 5 s");
  });
});
