# Nexus AI Hub API (`@nexus/hub-api`)

Nexus AI Hub (formerly Zentrix AI Hub) is the public product: xAI Grok video and images and Groq fast
text models for African creators, developers and students, paid for in Naira from one prepaid wallet.
It follows the _Zentrix AI Hub – Development Concept and Production Plan_ (v1.0, 13 October 2026), and
sits in the **customer zone** of this monorepo ([ADR 0015](../../docs/adr/0015-nexus-ai-hub-integration.md)):
its own database, its own provider keys, and no access to Nexus Cloud's agents.

The history of the original `Zentrix-AI-Hub` repository is kept in this repository's Git history.

## What is here

| Path                   | What it is                                                                     |
| ---------------------- | ------------------------------------------------------------------------------ |
| `src/`                 | NestJS API: pricing engine, wallet and ledger, Paystack top-ups and webhook    |
| `supabase/migrations/` | The Hub database (plan section 11); deployed by the Supabase CLI               |
| `scripts/migrate.mjs`  | Applies the same migrations to a plain PostgreSQL database (tests, local runs) |
| `test/`                | Integration tests against a real database                                      |

Injected dependencies always name their token with `@Inject(...)`: esbuild and Vitest don't emit the
decorator metadata NestJS would otherwise read.

### The money path

Every Naira movement is a row in the append-only `ledger_entries` table, and each step is
one short transaction. Providers are never called while a transaction is open:

1. **Quote**: the price is computed from the `products` table and shown before "Generate".
2. **Hold**: the quote moves from `balance_kobo` to `held_kobo`. If the balance is too low, nothing changes.
3. The worker calls xAI or Groq outside any transaction.
4. **Capture** on success keeps the real charge (never more than the quote) and returns the rest.
   **Release** on failure returns the whole hold.

Every step is safe to retry, and a webhook can arrive any number of times without crediting
twice. `WalletService.findMismatches()` and `releaseStaleHolds()` are the nightly checks.

### Changes from the schema in the plan

- Adds the `citext` extension (`users.email` uses `CITEXT`).
- Gives text products separate input and output prices (`output_cost_usd_micros`,
  `output_price_kobo`), because a text request is billed on both.
- Adds a `bundles` table, a `jobs.started_at` column, foreign keys from the ledger to
  payments and jobs, and a trigger that blocks `UPDATE` and `DELETE` on the ledger.
- Turns on row-level security for every table, with no policies, and removes Supabase's
  `anon` and `authenticated` roles' access (`0003_lock_down_public_schema.sql`). Any new
  table needs `ENABLE ROW LEVEL SECURITY` in its migration; a test fails otherwise.

### Launch prices

`0002_seed_prices.sql` loads the plan's prices at ₦1,400/$. Typical-request margins, which
the tests check against plan section 6, are: video 57–65%, images 68%, text 79–89%. The
Owner Dashboard (in Nexus Cloud) will edit these rows later; no code change is needed to reprice.

## Running it

Local development uses the Supabase Postgres from `supabase start` (port 54322).

```sh
pnpm install
cp apps/hub-api/.env.example apps/hub-api/.env   # then fill in the values
pnpm --filter @nexus/hub-api db:migrate          # needs DATABASE_URL
pnpm --filter @nexus/hub-api dev
```

Tests:

```sh
pnpm --filter @nexus/hub-api test      # unit tests
pnpm --filter @nexus/hub-api test:db   # plus integration tests on a throwaway nexus_hub_test database
```

CI runs the integration tests on plain PostgreSQL 17, the hosted version. One security probe, which switches to a
restricted role, is skipped on the local Supabase image because that image drops the connection
when a session switches roles (threat model, Sprint 1).

## Endpoints so far

| Method | Path                 | Notes                                                                                    |
| ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/health`            | Checks the database                                                                      |
| GET    | `/products`          | Public price list (no costs or margins)                                                  |
| POST   | `/webhooks/paystack` | Checks `x-paystack-signature`, then confirms with Paystack's verify API before crediting |

## Next (Sprint 1 onwards)

- Sign-up and sign-in (email or phone OTP, Google), 18+ check, admin 2FA
- Authenticated routes: start a top-up, wallet history, quotes
- `apps/hub-web` (Creator Studio first); the Owner Dashboard lives in Nexus Cloud under `/owner`
- AI gateway (the shared `@nexus/model-gateway`) with the xAI adapter, moderation, and a pg-boss job worker
