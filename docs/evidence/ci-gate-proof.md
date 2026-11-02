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

1. **Semgrep:** `secrets: inherit` in the new database deploy workflow passed every secret to the reusable job. Simply removing it broke the production deploy, because the reusable workflow could no longer see the environment's secrets (run 41472085762; nothing was applied). The final fix: one ordinary job per environment, each declaring its GitHub environment and passing only its three Supabase values to a shared composite action (`.github/actions/supabase-deploy`).
2. **E2E in CI:** sign-ins hit local Supabase's per-IP limit (30 per 5 minutes), because the suite now signs in about 40 times. Local and CI limits were raised in `supabase/config.toml`; hosted limits are unchanged.

## What happened next: the red branches were merged

Both proof branches were opened as pull requests and merged (#6 and #7) while their checks were red. GitHub allowed it because `main` doesn't require the checks yet. The next commit removed the failing test and the fake key file. gitleaks scans the whole history, so `.gitleaks.toml` exempts just that fake file in commit `5873f34`.

This is the strongest evidence for the open Sprint 0 item: **until [branch protection](../runbooks/branch-protection.md) is on, a red pull request can still be merged.**
