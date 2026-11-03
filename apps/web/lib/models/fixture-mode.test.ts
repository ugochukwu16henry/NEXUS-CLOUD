import { describe, expect, it } from "vitest";
import { allowFixtureMode } from "./fixture-mode";

describe("allowFixtureMode", () => {
  it("allows the recorded reply only for a local Supabase", () => {
    expect(allowFixtureMode("1", "http://127.0.0.1:54321")).toBe(true);
    expect(allowFixtureMode("1", "http://localhost:54321")).toBe(true);
  });

  it("refuses a hosted project even when the flag is set", () => {
    expect(allowFixtureMode("1", "https://abc.supabase.co")).toBe(false);
    expect(allowFixtureMode("0", "http://127.0.0.1:54321")).toBe(false);
    expect(allowFixtureMode(undefined, "http://127.0.0.1:54321")).toBe(false);
  });
});
