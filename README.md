# Nexus Cloud

A personal AI-powered software engineering cloud: one dark cockpit that coordinates AI specialist agents, source code, tests, security checks, deployments, a client portal and marketing assets. The owner picks the model for each job, watches spend and approves risky actions.

> Working name only. Domain and trademark checks are pending.

**Status:** Sprint 0 (Foundation). See the [plan](docs/plan/Nexus_Cloud_Structure_Sprint_and_Test_Plan.pdf).

## Repository layout

| Path              | What it is                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js cockpit, client portal and marketing studio (Sprint 0: static cockpit prototype) |
| `apps/worker`     | Queue consumer for agent runs, builds, tests and scans (Sprint 0: heartbeat only)        |
| `packages/core`   | Domain types and the workflow state machine                                              |
| `packages/config` | Environment schema; keeps server-only variables out of the browser                       |
| `packages/ui`     | Dark design tokens                                                                       |
| `supabase/`       | Migrations, seed data and pgTAP policy tests                                             |
| `tests/e2e`       | Playwright journeys with axe accessibility checks                                        |
| `docs/`           | ADRs, requirements, threat model, provider register, runbooks, plan                      |

More packages (`db`, `auth`, `model-gateway`, `agents`, `sandbox`, `integrations`, `quality`, `audit`, `observability`) arrive in the sprints that need them.

## Getting started

Requires Node 24 and pnpm 11. The Supabase CLI and Docker Desktop are needed from Sprint 1.

```bash
pnpm install
pnpm dev          # web on http://localhost:3000, worker in watch mode
```

## Checks

| Command                                              | Gate                                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | G1 static                                    |
| `pnpm test`                                          | G2 unit/integration                          |
| `pnpm build && pnpm check:bundle-secrets`            | No server-only secrets in the browser bundle |
| `pnpm build && pnpm test:e2e`                        | G4 E2E + accessibility                       |

CI runs all of these on every pull request ([ci.yml](.github/workflows/ci.yml)), plus gitleaks, OSV-Scanner and Semgrep ([security.yml](.github/workflows/security.yml)). A pre-commit hook runs ESLint and Prettier on staged files.

## Key documents

- [Architecture decisions](docs/adr/README.md)
- [Requirements brief](docs/requirements/requirements-brief.md)
- [Threat model v1](docs/threat-model/threat-model-v1.md)
- [Provider register](docs/provider-register/providers.md) and [benchmark plan](docs/provider-register/benchmark-plan.md)
