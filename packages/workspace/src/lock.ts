/**
 * One editor per change set (ADR 0017). A lock lasts 10 minutes and is extended by every save, so
 * a closed tab frees it on its own. Anyone else gets read-only access until it expires.
 */
export const LOCK_MINUTES = 10;

export type LockState = { lockedBy: string | null; lockedUntil: string | null };
export type LockDecision =
  { ok: true; lockedUntil: string } | { ok: false; heldBy: string; until: string };

export function decideLock(state: LockState, requester: string, now: Date): LockDecision {
  const until = state.lockedUntil ? Date.parse(state.lockedUntil) : 0;
  const free = !state.lockedBy || until <= now.getTime() || state.lockedBy === requester;
  if (!free) return { ok: false, heldBy: state.lockedBy!, until: state.lockedUntil! };
  return { ok: true, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() };
}
