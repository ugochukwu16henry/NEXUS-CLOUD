import { buildCsp, createNonce, isCrossSiteMutation, isPublicPath } from "./security-headers";

describe("buildCsp", () => {
  const prod = buildCsp({ nonce: "abc123", isDev: false, supabaseUrl: "https://x.supabase.co" });

  it("only runs scripts carrying this request's nonce", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
  });

  it("does not let the browser talk to Supabase directly", () => {
    expect(prod).toMatch(/connect-src 'self'(;|$)/);
  });

  it("allows eval and websockets only in development", () => {
    const dev = buildCsp({ nonce: "n", isDev: true, supabaseUrl: "http://127.0.0.1:54321" });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("returns a fresh base64 value each time", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe("isCrossSiteMutation", () => {
  it.each([
    ["GET", "https://evil.example", "nexus.app", false],
    ["POST", "https://nexus.app", "nexus.app", false],
    ["POST", "https://evil.example", "nexus.app", true],
    ["DELETE", null, "nexus.app", true],
    ["PUT", "not a url", "nexus.app", true],
  ] as const)("%s from %s to %s → %s", (method, origin, host, expected) => {
    expect(isCrossSiteMutation(method, origin, host)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it.each(["/login", "/auth/callback", "/api/webhooks/github"])("%s is public", (path) =>
    expect(isPublicPath(path)).toBe(true),
  );
  it.each([
    "/",
    "/settings",
    "/audit",
    "/mfa",
    "/loginx",
    "/api/other",
    "/integrations/github/setup",
  ])("%s needs a session", (path) => expect(isPublicPath(path)).toBe(false));
});
