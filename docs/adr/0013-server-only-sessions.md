# ADR 0013: Server-only sessions in HttpOnly cookies

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Supabase's browser client normally keeps the session in cookies that JavaScript can read. Any script running on the page, including one injected through an XSS bug or a compromised dependency, could then steal the access and refresh tokens. The Sprint 1 test plan requires HttpOnly session cookies (threat model T01).

## Decision

- All authentication happens on the server: server actions request magic links and run MFA checks, `/auth/callback` exchanges the PKCE code, and `proxy.ts` refreshes sessions.
- Session cookies are set `HttpOnly`, `SameSite=Lax`, and `Secure` outside local development (`apps/web/lib/supabase/cookies.ts`).
- The browser never talks to Supabase directly. The CSP `connect-src` is `'self'`, and there is no browser Supabase client.
- Sign-up is closed at the database: an `auth.users` trigger rejects any email that is not on `signup_allowlist`. The server adds the owner's email (`NEXUS_OWNER_EMAIL`) at first sign-in; invites add clients (Sprint 9).
- Risk permissions (`RISK_PERMISSIONS` in `@nexus/auth`) need an aal2 session, which means a TOTP code verified in that session.

## Consequences

- Supabase Realtime cannot be used straight from the browser. Live updates (from Sprint 6) need a server-sent events endpoint or a short-lived, narrowly scoped token. That will be a new ADR when it's needed.
- Every page renders per request, which is also what the per-request CSP nonce requires.
- Locking out non-allowlisted sign-ups at the database also covers direct calls to the public Auth API with the publishable key.
