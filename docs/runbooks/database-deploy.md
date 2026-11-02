# Runbook: database migrations to hosted Supabase

Migrations in `supabase/migrations/` are applied to the hosted project by
[`deploy-database.yml`](../../.github/workflows/deploy-database.yml). It runs when a migration
reaches `main`, or by hand from the Actions tab (**Deploy database → Run workflow**).

Each run:

1. Tests the migrations on a fresh database with the pgTAP suite. If anything fails, nothing is deployed.
2. Waits for approval if the `production` environment requires reviewers.
3. Links the hosted project, lists the pending migrations, and runs `supabase db push`.

## One-time setup

In GitHub, go to the repository's **Settings → Environments → New environment**, name it `production`, and add these **environment secrets**:

| Secret                  | Where to find it                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → your avatar → **Account preferences → Access Tokens → Generate new token**                          |
| `SUPABASE_PROJECT_ID`   | The project ref: the part before `.supabase.co` in the project URL                                                 |
| `SUPABASE_DB_PASSWORD`  | The database password chosen when the project was created (reset it under **Project Settings → Database** if lost) |

Recommended: under **Deployment protection rules**, tick **Required reviewers** and add yourself. Every schema change then waits for your click in the Actions tab.

## Writing migrations

- Never edit a migration that has already been deployed. Add a new one: `supabase migration new <name>`.
- After changing the schema locally, run `supabase db reset`, `pnpm test:db` and `pnpm db:types`.
- Destructive changes (dropping a column or table) need a backup first: **Database → Backups** in the Supabase dashboard.

## If a deploy fails

- **Missing secrets:** the run says which ones; add them and re-run.
- **Migration error:** nothing after the failing statement was applied; each migration runs in its own transaction. Fix it in a new migration, merge, and the workflow runs again.
