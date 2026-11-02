import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/", "/settings", "/settings/security?tab=mfa", "/audit#top"])("keeps %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "settings",
    "/\t/evil.example",
    "/\n/evil.example",
    "",
    undefined,
    null,
    42,
    "/" + "a".repeat(600),
  ])("rejects %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("//x", "/login")).toBe("/login");
  });
});
