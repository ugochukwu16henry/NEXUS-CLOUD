-- Zentrix AI Hub: core schema (plan section 11).
-- Money is always whole kobo (BIGINT). Provider costs are millionths of a US dollar.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

CREATE TYPE user_role   AS ENUM ('creator', 'developer', 'student');
CREATE TYPE provider    AS ENUM ('xai', 'groq', 'gemini');
CREATE TYPE job_status  AS ENUM ('quoted', 'held', 'running', 'succeeded', 'failed', 'refunded');
CREATE TYPE ledger_kind AS ENUM ('topup', 'bonus', 'hold', 'release', 'capture', 'refund', 'adjustment');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         CITEXT UNIQUE,
  phone         TEXT UNIQUE,
  password_hash TEXT,                              -- argon2id
  primary_role  user_role NOT NULL DEFAULT 'creator',
  country_code  CHAR(2) NOT NULL DEFAULT 'NG',
  state         TEXT,
  date_of_birth DATE,                              -- 18+ check at launch
  referred_by   UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE wallets (
  user_id     UUID PRIMARY KEY REFERENCES users(id),
  currency    CHAR(3) NOT NULL DEFAULT 'NGN',
  balance_kobo BIGINT NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),  -- spendable
  held_kobo    BIGINT NOT NULL DEFAULT 0 CHECK (held_kobo >= 0),     -- reserved for running jobs
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What we pay providers (USD) and what we charge (NGN), versioned.
CREATE TABLE fx_rates (
  id             BIGSERIAL PRIMARY KEY,
  usd_ngn        NUMERIC(10, 2) NOT NULL CHECK (usd_ngn > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Text products are metered per million tokens and carry a separate output price;
-- every other unit has a single price.
CREATE TABLE products (
  code                   TEXT PRIMARY KEY,               -- e.g. video_std, text_dev
  provider               provider NOT NULL,
  model                  TEXT NOT NULL,                  -- e.g. grok-imagine-video
  workspace              TEXT NOT NULL CHECK (workspace IN ('studio', 'console', 'academy')),
  unit                   TEXT NOT NULL CHECK (unit IN ('second', 'image', '1m_tokens')),
  cost_usd_micros        BIGINT NOT NULL CHECK (cost_usd_micros >= 0),  -- per unit (input tokens for text)
  price_kobo             BIGINT NOT NULL CHECK (price_kobo >= 0),       -- per unit, VAT included
  output_cost_usd_micros BIGINT CHECK (output_cost_usd_micros >= 0),
  output_price_kobo      BIGINT CHECK (output_price_kobo >= 0),
  active                 BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((unit = '1m_tokens') = (output_cost_usd_micros IS NOT NULL AND output_price_kobo IS NOT NULL))
);

CREATE TABLE bundles (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price_kobo  BIGINT NOT NULL CHECK (price_kobo > 0),
  credit_kobo BIGINT NOT NULL CHECK (credit_kobo >= price_kobo),
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  gateway           TEXT NOT NULL CHECK (gateway IN ('paystack', 'flutterwave')),
  gateway_reference TEXT NOT NULL UNIQUE,
  bundle_code       TEXT REFERENCES bundles(code),
  amount_kobo       BIGINT NOT NULL CHECK (amount_kobo > 0),
  credit_kobo       BIGINT NOT NULL,                     -- amount + bundle bonus
  fee_kobo          BIGINT,                              -- gateway fee, from the verify call
  method            TEXT,                                -- card | bank_transfer | ussd | opay ...
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (credit_kobo >= amount_kobo)
);

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  workspace           TEXT NOT NULL CHECK (workspace IN ('studio', 'console', 'academy', 'api')),
  product_code        TEXT NOT NULL REFERENCES products(code),
  status              job_status NOT NULL DEFAULT 'quoted',
  quoted_kobo         BIGINT NOT NULL CHECK (quoted_kobo > 0),  -- shown to the user and held
  charged_kobo        BIGINT CHECK (charged_kobo >= 0),         -- final (<= quoted for metered text)
  provider_request_id TEXT,
  input_tokens        INT,
  output_tokens       INT,
  video_seconds       INT,
  images              INT,
  cost_usd_micros     BIGINT,                                   -- actual provider cost from the response
  fx_rate_id          BIGINT REFERENCES fx_rates(id),
  error               TEXT,
  idempotency_key     TEXT UNIQUE,                              -- double clicks create one job
  output_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  CHECK (charged_kobo IS NULL OR charged_kobo <= quoted_kobo)
);

-- Every movement of money, never updated or deleted.
CREATE TABLE ledger_entries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  kind        ledger_kind NOT NULL,
  amount_kobo BIGINT NOT NULL,            -- + adds to balance, - takes from it
  payment_id  UUID REFERENCES payments(id),
  job_id      UUID REFERENCES jobs(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, payment_id),              -- a payment is credited once
  UNIQUE (kind, job_id)                   -- a job is held / captured / released once
);

CREATE INDEX ON jobs (user_id, created_at DESC);
CREATE INDEX ON jobs (status) WHERE status IN ('held', 'running');
CREATE INDEX ON ledger_entries (user_id, created_at DESC);
CREATE INDEX ON payments (user_id, created_at DESC);

-- The ledger is append-only.
CREATE FUNCTION ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();
