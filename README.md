# Nexus Cloud

A personal AI-powered software engineering cloud for one person, its owner: one dark cockpit that coordinates AI specialist agents, source code, tests, security checks and deployments, and (later) a Studio for videos and images. The owner picks the model for each job, watches spend and approves risky actions. There are no other users, clients or payments ([ADR 0020](docs/adr/0020-owner-only-platform.md)).

> Working name only. Domain and trademark checks are pending.

**Status:** Sprint 6 (agent queue, planner and coder, terminal tickets, sandbox limits) in place. The golden-set acceptance rate is not recorded: no provider account is funded. Sprint 5 added the model gateway. See the [plan](docs/plan/Nexus_Cloud_Structure_Sprint_and_Test_Plan.pdf).

## Repository layout

| Path                     | What it is                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- |
| `apps/web`               | Next.js cockpit: sign-in, MFA, projects, board, code, agents, audit              |
| `apps/worker`            | Queue consumer for agent runs and the terminal gateway (pg-boss, sandbox)        |
| `packages/core`          | Domain types and the workflow state machine                                      |
| `packages/auth`          | Roles, permissions and the MFA rule for risk actions                             |
| `packages/audit`         | Audit event validation and writer                                                |
| `packages/observability` | JSON logger with secret redaction                                                |
| `packages/db`            | Database types generated from the migrations                                     |
| `packages/config`        | Environment schema; keeps server-only variables out of the browser               |
| `packages/integrations`  | GitHub App client, webhook verification and processing, task links               |
| `packages/workspace`     | Path guard, upload checks, secret scan, diff, branch and commit rules, edit lock |
| `packages/model-gateway` | Routing, pricing, budget guard, provider catalog and adapters                    |
| `packages/agents`        | Agent contract, command policy, queue, sandbox limits and terminal tickets       |
| `packages/ui`            | Design tokens: dark Console theme (Ink & Cobalt kept for the future Studio)      |
| `supabase/`              | Migrations, seed data and pgTAP policy tests                                     |
| `tests/e2e`              | Playwright journeys with axe accessibility checks                                |
| `docs/`                  | ADRs, requirements, threat model, provider register, runbooks, plan              |

## Getting started

Requires Node 24, pnpm 11, the Supabase CLI and Docker Desktop.

```bash
pnpm install
supabase start          # local Postgres, Auth, API and Mailpit
pnpm env:local          # writes apps/web/.env.local; owner email defaults to owner@nexus.test
pnpm dev                # web on http://localhost:3000, worker in watch mode
```

Sign in at http://localhost:3000/login with the owner email. Local sign-in emails go to Mailpit at http://127.0.0.1:54324. To use your own address, run `pnpm env:local you@example.com`. Sign-up is closed to everyone else (ADR 0013).

After changing a migration, run `supabase db reset`, then `pnpm db:types`.

## Checks

| Command                                              | Gate                                          |
| ---------------------------------------------------- | --------------------------------------------- |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | G1 static                                     |
| `pnpm test`                                          | G2 unit tests                                 |
| `pnpm test:db`                                       | G2 RLS and audit-log policy tests (pgTAP)     |
| `pnpm --filter @nexus/integrations test:int`         | G2 GitHub webhook processing (local Supabase) |
| `pnpm build && pnpm check:bundle-secrets`            | No server-only secrets in the browser bundle  |
| `pnpm build && pnpm test:e2e`                        | G4 E2E, accessibility and security headers    |

E2E tests need local Supabase running. They delete and recreate the local owner account, and they refuse to run against a non-local Supabase.

CI runs all of these on every pull request ([ci.yml](.github/workflows/ci.yml)), plus gitleaks, OSV-Scanner and Semgrep ([security.yml](.github/workflows/security.yml)). A pre-commit hook runs ESLint and Prettier on staged files.

## Key documents

- [Architecture decisions](docs/adr/README.md)
- [Requirements brief](docs/requirements/requirements-brief.md)
- [Threat model v1](docs/threat-model/threat-model-v1.md)
- [Provider register](docs/provider-register/providers.md) and [benchmark plan](docs/provider-register/benchmark-plan.md)
