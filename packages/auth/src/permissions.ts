/**
 * Role-based permissions (Sprint 1). Every server-side check goes through `authorize`, and RLS in
 * Postgres enforces the same boundaries again (defence in depth, threat model T02).
 */
export const ROLES = ["owner", "client", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "workspace:read",
  "project:read",
  "project:write",
  "task:approve",
  "requirement:approve",
  "audit:read",
  "member:manage",
  "settings:update",
  "profile:update",
  "session:revoke_all",
  /** The Owner Dashboard: Nexus AI Hub customers, revenue and provider bills (ADR 0015). */
  "business:read",
  /** Install or change the GitHub App, retry webhook deliveries (Sprint 3). */
  "integration:manage",
  /** Raise a spend cap or lift a hard stop (Sprint 5). */
  "budget:extend",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  client: new Set(["workspace:read", "project:read", "profile:update", "session:revoke_all"]),
  viewer: new Set(["workspace:read", "project:read", "profile:update", "session:revoke_all"]),
};

/**
 * Risk actions need a second factor in this session (blueprint: human approval at risk boundaries).
 * Revoking every session is included because it is what an attacker with a stolen session would do
 * to lock the real user out.
 */
export const RISK_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "task:approve",
  "member:manage",
  "session:revoke_all",
  // Customer personal data and company finances: the Hub plan requires two-step sign-in for them.
  "business:read",
  // Connecting GitHub grants Nexus write access to repositories.
  "integration:manage",
  // Raising a cap or lifting a hard stop lets models keep spending.
  "budget:extend",
]);

export type AssuranceLevel = "aal1" | "aal2";

export type Subject = {
  /** Role in the workspace being acted on, or null when the user has no membership. */
  role: Role | null;
  /** Authenticator assurance level of the current session (aal2 = MFA verified). */
  aal: AssuranceLevel;
};

export type Decision =
  { allowed: true } | { allowed: false; reason: "not_member" | "forbidden" | "mfa_required" };

export function authorize(subject: Subject, permission: Permission): Decision {
  if (subject.role === null) return { allowed: false, reason: "not_member" };
  if (!GRANTS[subject.role].has(permission)) return { allowed: false, reason: "forbidden" };
  if (RISK_PERMISSIONS.has(permission) && subject.aal !== "aal2") {
    return { allowed: false, reason: "mfa_required" };
  }
  return { allowed: true };
}

export function can(subject: Subject, permission: Permission): boolean {
  return authorize(subject, permission).allowed;
}
