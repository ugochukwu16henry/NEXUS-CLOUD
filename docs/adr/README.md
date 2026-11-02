# Architecture Decision Records

| ADR                                         | Decision                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| [0001](0001-modular-monolith.md)            | Modular monolith plus a worker process                          |
| [0002](0002-monorepo-tooling.md)            | pnpm workspaces and Turborepo                                   |
| [0003](0003-web-stack.md)                   | Next.js, TypeScript and Tailwind for the web app                |
| [0004](0004-supabase-platform.md)           | Supabase for database, auth, storage and RLS                    |
| [0005](0005-execution-model.md)             | Browser-only workspace with managed sandbox execution           |
| [0006](0006-pilot-repository.md)            | New sample repository as the pilot project                      |
| [0007](0007-budget-caps.md)                 | Initial spend caps and cost controls                            |
| [0008](0008-model-providers.md)             | Provider abstraction and benchmark candidates                   |
| [0009](0009-mvp-languages.md)               | TypeScript and JavaScript only in the MVP                       |
| [0010](0010-mandatory-security-checks.md)   | Mandatory security checks for every project                     |
| [0011](0011-client-visibility.md)           | Client visibility defaults and invite expiry                    |
| [0012](0012-personal-first.md)              | Personal workflow before SaaS                                   |
| [0013](0013-server-only-sessions.md)        | Server-only sessions in HttpOnly cookies                        |
| [0014](0014-api-surface-and-test-layers.md) | API surface and test layers (server actions, no public API yet) |

New ADRs copy the format of an existing one and take the next number. Superseded ADRs keep their file and change status.
