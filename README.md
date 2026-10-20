# Zentrix AI Hub

An all-in-one AI platform for African creators, developers and students: xAI Grok
video and images, and Groq fast text models, paid for in Naira from one prepaid wallet.

This repository follows the *Development Concept and Production Plan* (v1.0, 13 October 2026).
It holds the **Phase 0 foundation**: the monorepo, the database schema, and the money path
everything else is built on.

## What is here

| Path | What it is |
| --- | --- |
| `packages/db` | PostgreSQL migrations (plan section 11) and a small migration runner |
| `apps/api` | NestJS API: pricing engine, wallet and ledger, Paystack top-ups and webhook |
| `.github/workflows/ci.yml` | Typecheck, build and tests against a real PostgreSQL |

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
Owner Dashboard will edit these rows later; no code change is needed to reprice.

## Running it

Requirements: Node 22+, pnpm 10, and PostgreSQL 16 (or `docker compose up -d`).

```sh
pnpm install
cp .env.example .env                 # then fill in the values
docker compose up -d                 # PostgreSQL and Redis
DATABASE_URL=postgres://postgres:postgres@localhost:5432/zentrix pnpm db:migrate
pnpm --filter @zentrix/api build
pnpm --filter @zentrix/api start     # needs DATABASE_URL and PAYSTACK_SECRET_KEY in the environment
```

### Using Supabase

Supabase is only the PostgreSQL host; all reads and writes go through this API. Use the
**Session pooler** connection string (Connect → Direct) with `?sslmode=require` as
`DATABASE_URL`. Don't use supabase-js against these tables from the browser: the lockdown
migration makes the Data API return nothing.

Tests create and migrate a throwaway `zentrix_test` database (override with `TEST_DATABASE_URL`):

```sh
pnpm test
```

## Endpoints so far

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Checks the database |
| GET | `/products` | Public price list (no costs or margins) |
| POST | `/webhooks/paystack` | Checks `x-paystack-signature`, then confirms with Paystack's verify API before crediting |

## Next (Sprint 1 onwards)

- Sign-up and sign-in (email or phone OTP, Google), 18+ check, admin 2FA
- Authenticated routes: start a top-up, wallet history, quotes
- Next.js web app (Creator Studio first) and the Owner Dashboard
- AI gateway with the xAI adapter, moderation, and the BullMQ job worker
