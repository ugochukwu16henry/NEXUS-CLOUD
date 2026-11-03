import { describe, expect, it } from "vitest";
import { PERMISSIONS, RISK_PERMISSIONS, authorize, can } from "./permissions";

// Owner-only (ADR 0020): the owner can do everything, with the second factor on risk actions;
// anyone without the owner's membership can do nothing.
describe("owner with MFA verified (aal2)", () => {
  it.each(PERMISSIONS)("can %s", (permission) => {
    expect(can({ role: "owner", aal: "aal2" }, permission)).toBe(true);
  });
});

describe("owner without MFA (aal1)", () => {
  it.each(PERMISSIONS)("%s needs the second factor only if it is a risk action", (permission) => {
    expect(authorize({ role: "owner", aal: "aal1" }, permission)).toEqual(
      RISK_PERMISSIONS.has(permission)
        ? { allowed: false, reason: "mfa_required" }
        : { allowed: true },
    );
  });

  it("treats the terminal, approvals, GitHub, budgets and sign-out-everywhere as risk actions", () => {
    for (const permission of [
      "task:approve",
      "terminal:start",
      "integration:manage",
      "budget:extend",
      "session:revoke_all",
    ] as const) {
      expect(RISK_PERMISSIONS.has(permission)).toBe(true);
    }
  });
});

describe("anyone else", () => {
  it.each(PERMISSIONS)("cannot %s, even with MFA", (permission) => {
    expect(authorize({ role: null, aal: "aal2" }, permission)).toEqual({
      allowed: false,
      reason: "not_member",
    });
  });
});
