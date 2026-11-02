import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { REDACTED, redact, redactString } from "./redact";

// Fake credentials are assembled at runtime so that secret scanners (gitleaks, Semgrep) don't
// flag this file: the source never contains a complete secret-shaped string.
const fake = (prefix: string, length: number) => prefix + "x".repeat(length);
const JWT = [
  ["eyJ", "hbGciOiJIUzI1NiJ9"].join(""),
  ["eyJ", "zdWIiOiJ0ZXN0In0"].join(""),
  "fakesignature0000",
].join(".");

describe("redactString", () => {
  it.each([
    ["JWT", `token=${JWT}`],
    ["Bearer header", `Authorization: Bearer ${fake("tok", 16)}`],
    ["Anthropic key", `key ${fake("sk-ant-api03-", 20)}`],
    ["OpenAI key", fake("sk-proj-", 24)],
    ["xAI key", fake("xai-", 24)],
    ["Google key", fake("AIza", 35)],
    ["Supabase secret", fake("sb_secret_", 24)],
    ["GitHub token", fake("ghp_", 36)],
  ])("removes a %s", (_name, input) => {
    expect(redactString(input)).toContain(REDACTED);
  });

  it("masks emails but keeps the first letter and domain", () => {
    expect(redactString("login by henry@example.com")).toBe("login by h***@example.com");
  });

  it("leaves ordinary text alone", () => {
    expect(redactString("task NX-12 moved to review")).toBe("task NX-12 moved to review");
  });
});

describe("redact", () => {
  it("replaces values of sensitive keys at any depth", () => {
    expect(
      redact({
        headers: { authorization: "anything", cookie: "sb-access-token=x" },
        apiKey: "plain",
        nested: [{ password: "hunter2", ok: "fine" }],
      }),
    ).toEqual({
      headers: { authorization: REDACTED, cookie: REDACTED },
      apiKey: REDACTED,
      nested: [{ password: REDACTED, ok: "fine" }],
    });
  });

  it("matches sensitive keys by name, not by substring", () => {
    expect(
      redact({
        access_token: "a",
        clientSecret: "b",
        "set-cookie": "c",
        totp: "123456",
        inputTokens: 1200,
        tokenCount: 5,
        cookieConsent: true,
      }),
    ).toEqual({
      access_token: REDACTED,
      clientSecret: REDACTED,
      "set-cookie": REDACTED,
      totp: REDACTED,
      inputTokens: 1200,
      tokenCount: 5,
      cookieConsent: true,
    });
  });

  it("redacts error messages and handles circular objects", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const result = redact({ error: new Error(`failed with ${JWT}`), circular }) as {
      error: { message: string };
      circular: { self: unknown };
    };
    expect(result.error.message).not.toContain(JWT);
    expect(result.circular.self).toBe("[Circular]");
  });
});

describe("createLogger", () => {
  function collect() {
    const lines: string[] = [];
    return { lines, write: (line: string) => lines.push(line) };
  }

  it("writes structured JSON with bindings and redaction", () => {
    const { lines, write } = collect();
    const logger = createLogger({ service: "web", write }).child({ correlationId: "c-1" });
    logger.info("signed in", { email: "henry@example.com", accessToken: JWT });

    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      level: "info",
      service: "web",
      message: "signed in",
      correlationId: "c-1",
      email: "h***@example.com",
      accessToken: REDACTED,
    });
    expect(lines[0]).not.toContain(JWT);
  });

  it("drops lines below the configured level", () => {
    const { lines, write } = collect();
    const logger = createLogger({ service: "web", level: "warn", write });
    logger.info("hidden");
    logger.warn("shown");
    expect(lines).toHaveLength(1);
  });

  it("does not let fields override the message or level", () => {
    const { lines, write } = collect();
    createLogger({ service: "web", write }).error("real", { level: "debug", message: "fake" });
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "error", message: "real" });
  });
});
