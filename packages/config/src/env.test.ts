import { describe, expect, it } from "vitest";
import { SERVER_ONLY_ENV_NAMES, parsePublicEnv, parseServerEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "service-role-secret-value",
  NEXUS_OWNER_EMAIL: "Owner@Nexus.test",
};

describe("parseServerEnv", () => {
  it("applies the USD 20 default budget", () => {
    expect(parseServerEnv(valid).NEXUS_GLOBAL_MONTHLY_BUDGET_USD).toBe(20);
  });

  it("lower-cases the owner email so comparisons are exact", () => {
    expect(parseServerEnv(valid).NEXUS_OWNER_EMAIL).toBe("owner@nexus.test");
  });

  it("names missing variables", () => {
    const { SUPABASE_SECRET_KEY: _omit, ...missing } = valid;
    expect(() => parseServerEnv(missing)).toThrow(/SUPABASE_SECRET_KEY/);
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
      SENTRY_DSN: "",
      NEXUS_GLOBAL_MONTHLY_BUDGET_USD: "",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.NEXUS_GLOBAL_MONTHLY_BUDGET_USD).toBe(20);
  });

  it("still requires the secret key when it is empty", () => {
    expect(() => parseServerEnv({ ...valid, SUPABASE_SECRET_KEY: "" })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
  });

  it("rejects a non-positive budget", () => {
    expect(() => parseServerEnv({ ...valid, NEXUS_GLOBAL_MONTHLY_BUDGET_USD: "0" })).toThrow();
  });
});

describe("parsePublicEnv", () => {
  it("needs only the public variables", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe(valid.NEXT_PUBLIC_SUPABASE_URL);
  });
});

describe("SERVER_ONLY_ENV_NAMES", () => {
  it("lists secrets and excludes public variables", () => {
    expect(SERVER_ONLY_ENV_NAMES).toContain("SUPABASE_SECRET_KEY");
    expect(SERVER_ONLY_ENV_NAMES).toContain("ANTHROPIC_API_KEY");
    expect(SERVER_ONLY_ENV_NAMES).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});
