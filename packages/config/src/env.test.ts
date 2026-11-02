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

  it("names missing variables", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...missing } = valid;
    expect(() => parseServerEnv(missing)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("does not leak secret values in validation errors", () => {
    const parse = () => parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    expect(parse).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(parse).not.toThrow(/service-role-secret-value/);
  });

  it("treats empty values from a copied .env.example as unset", () => {
    const env = parseServerEnv({
      ...valid,
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "   ",
      NEXUS_GLOBAL_MONTHLY_BUDGET_USD: "",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NEXUS_GLOBAL_MONTHLY_BUDGET_USD).toBe(20);
  });

  it("still requires the service-role key when it is empty", () => {
    expect(() => parseServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
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
