# Runbook: staging environment

The plan calls for a separate Supabase project for staging, so migrations and preview deployments are tried before they reach the database real data lives in. Until staging exists, the database deploy workflow skips it with a notice and deploys straight to production.

## 1. Create the Supabase project

1. supabase.com → **New project**, named `nexus-staging`, in the same region as production. Save the database password.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://nexus-git-main-henry-ugochukwus-projects.vercel.app` (the `main` branch preview)
   - **Redirect URLs:** `https://*-henry-ugochukwus-projects.vercel.app/**`
3. **Authentication → Multi-Factor:** turn on **TOTP** (enroll and verify).

## 2. Let the deploy workflow reach it

GitHub → Settings → Environments → **New environment** `staging`, with these secrets:

| Secret                  | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Same personal access token as production (or a new one) |
| `SUPABASE_PROJECT_ID`   | The staging project ref (20 letters)                    |
| `SUPABASE_DB_PASSWORD`  | The staging database password                           |

Then **Actions → Deploy database → Run workflow**. Staging is migrated first and production after it.

## 3. Point Vercel previews at staging

Vercel → project `nexus` → Settings → Environment Variables. For the **Preview** environment only, set:

- `NEXT_PUBLIC_SUPABASE_URL`: the staging URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the staging key
- `SUPABASE_SECRET_KEY`: the staging key, marked Sensitive
- `NEXUS_OWNER_EMAIL`: your email

**Production** keeps the production values. Redeploy a preview afterwards.

## 4. Re-run the performance targets against staging

The test plan sets the board (< 1.5 s with 500 tasks) and list (p95 < 300 ms) targets for staging. `tests/e2e/05-performance.spec.ts` enforces them exactly when `PERF_STRICT=1`. Run it with `E2E_BASE_URL` pointing at the staging preview. On laptops and shared CI runners it only fails on more than twice the target, because timings there swing widely: local runs measured a 0.9–1.7 s board and a 214–306 ms p95 on the same code.

## Known drift to remember

The hosted projects' auth settings (site URL, redirect URLs, TOTP) are set in the dashboard, not by `supabase config push`. The repository's `supabase/config.toml` describes local development. When an auth setting changes, update both dashboards and note it in the threat model change log.
