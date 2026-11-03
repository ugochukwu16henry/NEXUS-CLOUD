# ADR 0014: API surface and test layers

- **Status:** Accepted
- **Date:** 2026-11-03
- **Decider:** Henry Ugochukwu (owner)

## Context

The test plan for Sprints 1–2 calls for two things this codebase doesn't have yet:

- **API contract tests**, with a generated OpenAPI schema and checks on status codes (200/201/400/401/403/404/409) and pagination.
- **A separate integration suite** for auth flows and CRUD running against the database.

Both assume a REST API. Nexus Cloud uses Next.js server actions for every write and server components for every read. The only route handler is the auth callback, so there is no public HTTP API to describe or contract-test.

## Decision

1. **No public API until there is a consumer.** The first ones are GitHub, Vercel and Railway webhooks (Sprints 3 and 8), then the worker (Sprint 6). Each route handler that accepts external calls gets contract tests when it is added. That covers signature checks, status codes and schema validation, as Sprint 3's webhook tests already require. An OpenAPI document is generated once there are two or more public endpoints.
2. **The plan's API-level checks map onto server actions as follows:**

   | Plan check                   | Where it's covered                                                                                                                                              |
   | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Status codes: 400 validation | Server-action input schemas (`lib/projects/schemas.ts`, unit-tested) return a readable error                                                                    |
   | 401 / 403                    | `defineAction` access checks (audit sweep and permission matrix tests), plus RLS (pgTAP)                                                                        |
   | 404                          | Pages call `notFound()`; actions return "no longer exists"                                                                                                      |
   | 409 conflict                 | Optimistic concurrency (`updateVersioned`), tested in E2E with two tabs                                                                                         |
   | Pagination                   | Board columns show 50 cards with "show all"; activity and audit pages cap at 200 and 100 events. Cursor pagination arrives with the first public list endpoint. |

3. **Integration tests run through the real app.** Auth flows (sign-in, sign-out, tampered or expired session, MFA challenge) and CRUD run against a real local Supabase in the Playwright suite. Database rules are tested directly with pgTAP. A separate Vitest integration layer is added when the worker and webhook handlers need tests without a browser (Sprint 3).

## Consequences

- No hand-maintained API contract has to be kept in sync while nothing external depends on it.
- The E2E suite carries more of the integration load, so it must stay fast and deterministic. It currently runs about 29 tests in 3–4 minutes.
- Revisit this ADR when the first public endpoint is added in Sprint 3.

## Revisited in Sprint 3 (2026-11-04)

The first public endpoint arrived: `POST /api/webhooks/github`. As planned:

- **Contract:** the E2E suite drives it the way GitHub does (JSON body, `X-GitHub-Event`, `X-GitHub-Delivery`, `X-Hub-Signature-256`). It asserts the status codes: 202 accepted, 200 duplicate, 401 bad signature, 400 missing headers or invalid JSON, 413 over 1 MB, 503 when GitHub isn't configured. Unit tests cover the signature check itself. A recorded-payload test set (`events.test.ts`) pins the GitHub fields we depend on.
- **Vitest integration layer:** added in `packages/integrations` (`pnpm --filter @nexus/integrations test:int`). It runs the webhook processor against the real local Supabase: idempotency, retries with backoff, the dead-letter state, and installation changes. CI runs it in the E2E job, which already has the full stack.
- **Calls out to GitHub** are tested against a local fake GitHub (`tests/fake-github/server.mjs`), which verifies the app's RS256 JWT with a per-run key pair. The nightly contract test against the real GitHub API (plan, Sprint 3) needs the test App and a test repository. It is tracked as the Sprint 3 carry-over item in docs/runbooks/github-app.md.
- **OpenAPI** still waits for a second public endpoint. The setup callback (`/integrations/github/setup`) is a browser redirect for the signed-in owner, not an API.
