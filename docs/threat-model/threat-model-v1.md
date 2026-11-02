# Threat Model v1 (STRIDE)

- **Date:** 2026-11-02 · **Scope:** Release 1 architecture (ADRs 0001–0012) · **Review:** every sprint that adds a trust boundary
- **Method:** STRIDE per trust boundary. Every threat lists a control and the sprint whose tests prove that control.

## 1. Assets

| Asset                                          | Why it matters                         |
| ---------------------------------------------- | -------------------------------------- |
| Model provider API keys                        | Direct spend; account abuse            |
| Supabase service-role key                      | Bypasses RLS; full database access     |
| GitHub App private key and installation tokens | Write access to repositories           |
| Vercel/Railway tokens (preview vs production)  | Can change live systems                |
| Client data and unreleased work                | Confidentiality, client trust          |
| Audit log                                      | Accountability; must be tamper-evident |
| Budget/usage ledger                            | Cost control                           |

## 2. Trust boundaries and data flow

```
[Browser: owner/client] --HTTPS--> [Next.js web app + API] --SQL (RLS)--> [Supabase Postgres/Auth/Storage]
                                          |
                                          +--enqueue--> [Job queue (Postgres)] --> [Worker (Railway)]
                                                                                   |   |   |
                       [Sandbox container: untrusted repo code] <----------------+   |   +--> [Model providers x5]
                                                                                       +------> [GitHub / Vercel / Railway APIs]
[GitHub / Vercel / Railway webhooks] --HTTPS--> [Webhook inbox in API]
```

| ID  | Boundary                       | Untrusted side                                        |
| --- | ------------------------------ | ----------------------------------------------------- |
| B1  | Browser ↔ API                  | Browser, user input, client accounts                  |
| B2  | API/worker ↔ Supabase          | Mis-scoped queries                                    |
| B3  | Worker ↔ sandbox               | Repository code, build scripts, dependencies          |
| B4  | Worker ↔ model providers       | Model output (may be manipulated by injected content) |
| B5  | Worker ↔ GitHub/Vercel/Railway | Third-party responses                                 |
| B6  | Webhooks → API                 | Anyone on the internet                                |
| B7  | Agent context ↔ policy engine  | Repo files, issues, web pages, uploads                |

## 3. Threats and controls

| ID  | STRIDE          | Boundary | Threat                                           | Control                                                                                    | Proven in        |
| --- | --------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------- |
| T01 | Spoofing        | B1       | Session theft or credential stuffing             | Supabase Auth, HttpOnly/Secure/SameSite cookies, owner MFA for risk actions, rate limiting | Sprint 1         |
| T02 | Elevation       | B1/B2    | Client reads another project (IDOR)              | RLS deny-by-default plus backend `can()` checks                                            | Sprints 1, 9     |
| T03 | Info disclosure | B1       | Service-role or API key shipped in the JS bundle | Server-only env module; CI bundle grep                                                     | Sprints 0, 1     |
| T04 | Tampering       | B1       | CSRF on mutations                                | SameSite cookies, origin check, CSRF token                                                 | Sprint 1         |
| T05 | Repudiation     | all      | Action without a trace                           | Append-only audit events with correlation IDs                                              | Sprint 1         |
| T06 | Spoofing        | B6       | Forged webhook                                   | HMAC signature verification                                                                | Sprint 3         |
| T07 | Tampering       | B6       | Replayed webhook                                 | Delivery-ID uniqueness, timestamp window, idempotency                                      | Sprint 3         |
| T08 | Elevation       | B5       | Over-scoped GitHub App                           | Repo-scoped minimum permissions; short-lived installation tokens                           | Sprint 3         |
| T09 | Tampering       | B3       | Agent writes outside its worktree or to main     | Path guard, branch protection, push only to task branches                                  | Sprint 4         |
| T10 | DoS             | B4       | Runaway agent loop drains the budget             | Iteration caps, per-run/project/global budgets, hard stop                                  | Sprint 5         |
| T11 | Info disclosure | B4       | Secrets or excess code sent to providers         | Context minimisation, redaction, no secrets in prompts                                     | Sprints 5, 6     |
| T12 | Elevation       | B7       | Prompt injection via repo, issue or web content  | Untrusted-input labelling; policy engine checks every tool call; no ambient credentials    | Sprints 6, 10    |
| T13 | Elevation       | B3       | Sandbox escape or host abuse                     | Ephemeral non-root containers, no privileged mode, CPU/mem/time/disk/pid limits            | Sprint 6         |
| T14 | Info disclosure | B3       | Exfiltration from the sandbox                    | Default-deny egress with an allowlist (registry mirror, GitHub)                            | Sprint 6         |
| T15 | Tampering       | B3       | Malicious dependency in a managed repo           | OSV-Scanner, lockfile review, sandboxed install                                            | Sprint 7         |
| T16 | Elevation       | B5       | Accidental production deploy                     | Separate preview/production tokens; release gate with approval + MFA                       | Sprint 8         |
| T17 | Info disclosure | B1       | Client sees logs, findings or agent chat         | Curated, approval-filtered client model                                                    | Sprint 9         |
| T18 | Spoofing        | B1       | Invite link reuse or forwarding                  | Single-use hashed tokens with 7-day expiry, revocation                                     | Sprint 9         |
| T19 | DoS             | B5       | Provider outage or rate limits                   | Queue, backoff, fallback policy, status indicator                                          | Sprints 3, 5, 12 |
| T20 | Tampering       | B2       | Destructive migration in production              | Reviewed migrations, backups, approval gate                                                | Sprints 1, 12    |
| T21 | Info disclosure | all      | Secrets leaked into logs                         | Redacting logger; log-scan tests; gitleaks                                                 | Sprints 0, 1     |
| T22 | Tampering       | repo     | Secret committed to Nexus repo                   | gitleaks pre-commit and CI                                                                 | Sprint 0         |

## 4. Residual risks (accepted for now)

- Model providers process code snippets under their own data terms. Mitigation: minimise context, record each provider's terms in the register, and allow per-project provider restrictions.
- A single owner account is a single point of failure. Mitigation: MFA, recovery codes stored offline, and a restore drill.

## 5. Review log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | v1 created in Sprint 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-02 | Sprint 1: T01, T02 (workspace level), T03, T04, T05, T21 implemented and tested. Sign-up is closed at the database (allowlist trigger) and sessions are HttpOnly (ADR 0013). Finding: in the local Postgres image, a denied function call after `SET ROLE anon` in a superuser session crashes the backend. Through PostgREST (the real attack surface) the same call returns 401 and the server stays up. It is not exploitable by API users; worth re-checking on hosted Supabase in Sprint 12.                                        |
| 2026-11-03 | Proxy now verifies JWTs locally (`getClaims`, ES256) for speed; pages and actions still call `getUser`, so revoked sessions are rejected server-side. A revoked but unexpired session caused a redirect loop (proxy sent `/login` to `/`, the page sent it back); fixed by moving that redirect into the login page. Covered by an E2E regression test.                                                                                                                                                                                  |
| 2026-11-03 | Sentry added for the browser as well as the server (T21). User data collection is off, every event passes the shared redaction (`apps/web/lib/sentry.ts`, unit-tested), and tracing and replay are off. Browser events go through the same-origin `/monitoring` tunnel, so the CSP stays at `connect-src 'self'`. The proxy skips only that exact path. The DSN is public (`NEXT_PUBLIC_SENTRY_DSN`). The auth token stays in Vercel (Sensitive) and in the gitignored `.env.sentry-build-plugin`. Source maps are deleted after upload. |
