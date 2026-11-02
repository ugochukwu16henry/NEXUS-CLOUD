# Evidence: CI goes red on a failing test and on a planted secret

- **Date:** 2026-11-03 · **Plan items:** Sprint 0 tests "CI smoke" and "Security baseline"
- **Method:** two throwaway branches were pushed, observed and deleted. Neither was merged.

| Branch                                | Change                                           | Result                                                                                                                              | Run                                                                                                  |
| ------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `proof/ci-failing-test` (`e18f18c`)   | Added `expect(1 + 1).toBe(3)` to `packages/core` | **CI failed** at _Static checks, unit tests, build → Run pnpm test_, naming `deliberately failing test > fails on purpose`          | [CI run 41469529240](https://github.com/ugochukwu16henry/NEXUS-CLOUD/actions/runs/41469529240)       |
| `proof/ci-planted-secret` (`5873f34`) | Added a fake `api_key = "…"` in a text file      | **gitleaks failed** (`generic-api-key` at `docs/evidence/planted-secret.txt:3`) and **Semgrep failed** (`detected-generic-api-key`) | [Security run 41469689608](https://github.com/ugochukwu16henry/NEXUS-CLOUD/actions/runs/41469689608) |

The planted value was invented for the test and never belonged to any service. The branch was deleted after the run.

## What this proves, and what it doesn't

- **Proven:** the gates **detect** a failing test and a committed secret, and report the exact file and test.
- **Not yet:** **blocking**. A red check stops a merge only once `main` requires these checks; see [branch protection](../runbooks/branch-protection.md). Until the owner enables that, the evidence above shows detection only.

## Findings during the proof

The same runs surfaced two issues on `main`, fixed in the following commit:

1. **Semgrep:** `secrets: inherit` in the new database deploy workflow passed every secret to the reusable job. Removed: each deploy job now reads only its own GitHub environment's secrets.
2. **E2E in CI:** sign-ins hit local Supabase's per-IP limit (30 per 5 minutes), because the suite now signs in about 40 times. Local and CI limits were raised in `supabase/config.toml`; hosted limits are unchanged.
