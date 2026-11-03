import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  RISK_PERMISSIONS,
  ROLES,
  authorize,
  can,
  type Permission,
  type Role,
} from "./permissions";

// The full role × permission matrix (test plan, Sprint 1 unit tests). Every cell is asserted.
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
  owner: {
    "workspace:read": true,
    "project:read": true,
    "project:write": true,
    "task:approve": true,
    "requirement:approve": true,
    "audit:read": true,
    "member:manage": true,
    "settings:update": true,
    "profile:update": true,
    "session:revoke_all": true,
    "business:read": true,
  },
  client: {
    "workspace:read": true,
    "project:read": true,
    "project:write": false,
    "task:approve": false,
    "requirement:approve": false,
    "audit:read": false,
    "member:manage": false,
    "settings:update": false,
    "profile:update": true,
    "session:revoke_all": true,
    "business:read": false,
  },
  viewer: {
    "workspace:read": true,
    "project:read": true,
    "project:write": false,
    "task:approve": false,
    "requirement:approve": false,
    "audit:read": false,
    "member:manage": false,
    "settings:update": false,
    "profile:update": true,
    "session:revoke_all": true,
    "business:read": false,
  },
};

describe("permission matrix with MFA verified (aal2)", () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      const expected = EXPECTED[role][permission];
      it(`${role} ${expected ? "can" : "cannot"} ${permission}`, () => {
        expect(can({ role, aal: "aal2" }, permission)).toBe(expected);
      });
    }
  }
});

describe("risk permissions without MFA (aal1)", () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      if (!EXPECTED[role][permission]) continue;
      const risky = RISK_PERMISSIONS.has(permission);
      it(`${role} ${permission} at aal1 is ${risky ? "mfa_required" : "allowed"}`, () => {
        expect(authorize({ role, aal: "aal1" }, permission)).toEqual(
          risky ? { allowed: false, reason: "mfa_required" } : { allowed: true },
        );
      });
    }
  }
});

describe("authorize reasons", () => {
  it("denies users without a membership before checking anything else", () => {
    expect(authorize({ role: null, aal: "aal2" }, "workspace:read")).toEqual({
      allowed: false,
      reason: "not_member",
    });
  });

  it("reports forbidden, not mfa_required, when the role lacks the permission", () => {
    expect(authorize({ role: "client", aal: "aal1" }, "member:manage")).toEqual({
      allowed: false,
      reason: "forbidden",
    });
  });
});
