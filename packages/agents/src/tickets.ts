import { createHash, randomBytes } from "node:crypto";

/** A terminal ticket is shown once and stored only as a hash. It cannot be reused. */

export const TICKET_TTL_MS = 60_000;

export function issueTicket(now = Date.now()): { token: string; hash: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashTicket(token), expiresAt: now + TICKET_TTL_MS };
}

export function hashTicket(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TicketCheck =
  { ok: true } | { ok: false; reason: "expired" | "used" | "closed" | "mismatch" };

export function checkTicket(input: {
  token: string;
  hash: string;
  expiresAt: number;
  connectedAt: number | null;
  closedAt: number | null;
  now?: number;
}): TicketCheck {
  if (hashTicket(input.token) !== input.hash) return { ok: false, reason: "mismatch" };
  if (input.closedAt !== null) return { ok: false, reason: "closed" };
  if (input.connectedAt !== null) return { ok: false, reason: "used" };
  if ((input.now ?? Date.now()) > input.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}
