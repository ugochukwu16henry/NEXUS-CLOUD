import { describe, expect, it } from "vitest";
import { SERVER_ONLY_ENV_NAMES, parseServerEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
};

describe("parseServerEnv", () => {
  it("applies the USD 20 default budget", () => {
    expect(parseServerEnv(valid).NEXUS_GLOBAL_MONTHLY_BUDGET_USD).toBe(20);
  });

  it("names missing variables without leaking values", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...missing } = valid;
    expect(() => parseServerEnv({ ...missing, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    try {
      parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    } catch (error) {
      expect(String(error)).not.toContain("service-role-secret-value");
    }
  });

  it("rejects a non-positive budget", () => {
    expect(() => parseServerEnv({ ...valid, NEXUS_GLOBAL_MONTHLY_BUDGET_USD: "0" })).toThrow();
  });
});

describe("SERVER_ONLY_ENV_NAMES", () => {
  it("lists secrets and excludes public variables", () => {
    expect(SERVER_ONLY_ENV_NAMES).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(SERVER_ONLY_ENV_NAMES).toContain("ANTHROPIC_API_KEY");
    expect(SERVER_ONLY_ENV_NAMES).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});
