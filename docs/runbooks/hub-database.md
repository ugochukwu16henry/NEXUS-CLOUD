# Runbook: Nexus AI Hub database

Nexus AI Hub keeps its customers, wallets and ledger in **its own Supabase project**, separate from Nexus Cloud's ([ADR 0015](../adr/0015-nexus-ai-hub-integration.md)). Public sign-ups can never reach the agent cloud. The migrations live in `apps/hub-api/supabase/migrations` and deploy through `.github/workflows/deploy-hub-database.yml`: tests first, then `hub-staging`, then `hub-production`. Until the projects exist, both deploy jobs are skipped with a notice.

## 1. Create the projects

supabase.com → **New project**, in the same organisation as Nexus Cloud:

| Project                | Purpose                     |
| ---------------------- | --------------------------- |
| `nexus-ai-hub-staging` | Hub previews and testing    |
| `nexus-ai-hub`         | The live Hub, at Hub launch |

Choose a strong database password and keep it in your password manager. Pick the region closest to Nigeria that Supabase offers (currently Europe West, London or Frankfurt).

The Hub API connects to Postgres as the table owner. Customers never talk to Supabase directly, and the lockdown migration hides every table from Supabase's Data API. **Don't** add RLS policies or Data API access for Hub tables.

## 2. Let the deploy workflow reach them

GitHub → Settings → Environments. Create `hub-staging` and `hub-production`, each with:

| Secret                  | Value                                |
| ----------------------- | ------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | Your personal access token (`sbp_…`) |
| `SUPABASE_PROJECT_ID`   | That project's 20-letter ref         |
| `SUPABASE_DB_PASSWORD`  | That project's database password     |

Give `hub-production` a **required reviewer** (you), as for Nexus Cloud's production environment. Then **Actions → Deploy Hub database → Run workflow**.

At Hub launch, change the production job's `required` to `"true"` in the workflow. A missing secret then fails the run instead of skipping it.

## 3. Point the Hub API at it

The API (`apps/hub-api`, deployed in Hub Sprint 1) reads `DATABASE_URL`. Use the project's **session pooler** connection string, in the Hub's own Railway service, marked secret. **Never** give it to the Nexus Cloud web app or worker. The Owner Dashboard gets a separate read-only role in Hub Sprint 5.
