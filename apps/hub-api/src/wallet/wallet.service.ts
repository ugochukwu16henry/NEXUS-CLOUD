import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { inTransaction, PG_POOL } from "../db/db";
import type { Quote } from "../pricing/pricing.service";

export class InsufficientFundsError extends Error {
  constructor(readonly neededKobo: number) {
    super("wallet balance is too low");
  }
}

export type Workspace = "studio" | "console" | "academy" | "api";
export type JobStatus = "quoted" | "held" | "running" | "succeeded" | "failed" | "refunded";

export interface Wallet {
  userId: string;
  balanceKobo: number;
  heldKobo: number;
}

export interface CaptureResult {
  chargedKobo: number;
  costUsdMicros: number;
  inputTokens?: number;
  outputTokens?: number;
  videoSeconds?: number;
  images?: number;
  providerRequestId?: string;
  outputUrl?: string;
}

export interface Mismatch {
  userId: string;
  balanceKobo: number;
  ledgerKobo: number;
  heldKobo: number;
  openHoldsKobo: number;
}

interface LockedJob {
  user_id: string;
  quoted_kobo: number;
  charged_kobo: number | null;
  status: JobStatus;
}

async function lockJob(client: PoolClient, jobId: string): Promise<LockedJob> {
  const { rows } = await client.query(
    "SELECT user_id, quoted_kobo, charged_kobo, status FROM jobs WHERE id = $1 FOR UPDATE",
    [jobId],
  );
  if (rows.length === 0) throw new Error(`job ${jobId} not found`);
  return rows[0];
}

/**
 * The money path (plan section 11). Each step is one short transaction; providers
 * are called between steps, never inside one. Every step is safe to retry: a step
 * that already happened returns false and moves no money.
 */
@Injectable()
export class WalletService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getWallet(userId: string): Promise<Wallet> {
    const { rows } = await this.pool.query(
      "SELECT balance_kobo, held_kobo FROM wallets WHERE user_id = $1",
      [userId],
    );
    return { userId, balanceKobo: rows[0]?.balance_kobo ?? 0, heldKobo: rows[0]?.held_kobo ?? 0 };
  }

  /** Records a quoted job. The same idempotency key returns the same job (double clicks). */
  async createJob(
    userId: string,
    workspace: Workspace,
    quote: Quote,
    idempotencyKey?: string,
  ): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO jobs (user_id, workspace, product_code, quoted_kobo, fx_rate_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [
        userId,
        workspace,
        quote.productCode,
        quote.quotedKobo,
        quote.fxRateId,
        idempotencyKey ?? null,
      ],
    );
    if (rows.length > 0) return rows[0].id;
    const existing = await this.pool.query(
      "SELECT id, user_id FROM jobs WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    if (existing.rows[0]?.user_id !== userId)
      throw new ConflictException("idempotency key already used");
    return existing.rows[0].id;
  }

  /** 1. HOLD: reserve the quote before calling the provider. Throws InsufficientFundsError. */
  async hold(jobId: string): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const job = await lockJob(client, jobId);
      if (job.status !== "quoted") return false;
      const updated = await client.query(
        `UPDATE wallets SET balance_kobo = balance_kobo - $2, held_kobo = held_kobo + $2, updated_at = now()
         WHERE user_id = $1 AND balance_kobo >= $2`,
        [job.user_id, job.quoted_kobo],
      );
      if (updated.rowCount === 0) throw new InsufficientFundsError(job.quoted_kobo);
      await client.query(
        `INSERT INTO ledger_entries (user_id, kind, amount_kobo, job_id) VALUES ($1, 'hold', $2, $3)`,
        [job.user_id, -job.quoted_kobo, jobId],
      );
      await client.query(`UPDATE jobs SET status = 'held' WHERE id = $1`, [jobId]);
      return true;
    });
  }

  /** The worker has sent the job to the provider. */
  async markRunning(jobId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE jobs SET status = 'running', started_at = now() WHERE id = $1 AND status = 'held'`,
      [jobId],
    );
    return rowCount === 1;
  }

  /** 2a. CAPTURE on success: keep what it really cost (never more than the quote), return the rest. */
  async capture(jobId: string, result: CaptureResult): Promise<boolean> {
    if (!Number.isSafeInteger(result.chargedKobo) || result.chargedKobo < 0) {
      throw new RangeError("chargedKobo must be a non-negative integer");
    }
    return inTransaction(this.pool, async (client) => {
      const job = await lockJob(client, jobId);
      if (job.status !== "held" && job.status !== "running") return false;
      const charged = Math.min(result.chargedKobo, job.quoted_kobo);
      const returned = job.quoted_kobo - charged;
      await client.query(
        `UPDATE wallets SET held_kobo = held_kobo - $2, balance_kobo = balance_kobo + $3, updated_at = now()
         WHERE user_id = $1`,
        [job.user_id, job.quoted_kobo, returned],
      );
      await client.query(
        `INSERT INTO ledger_entries (user_id, kind, amount_kobo, job_id) VALUES ($1, 'capture', $2, $3)`,
        [job.user_id, returned, jobId],
      );
      await client.query(
        `UPDATE jobs SET status = 'succeeded', charged_kobo = $2, cost_usd_micros = $3,
           input_tokens = $4, output_tokens = $5, video_seconds = $6, images = $7,
           provider_request_id = $8, output_url = $9, finished_at = now()
         WHERE id = $1`,
        [
          jobId,
          charged,
          result.costUsdMicros,
          result.inputTokens ?? null,
          result.outputTokens ?? null,
          result.videoSeconds ?? null,
          result.images ?? null,
          result.providerRequestId ?? null,
          result.outputUrl ?? null,
        ],
      );
      return true;
    });
  }

  /** 2b. RELEASE on failure: the whole hold goes back. */
  async release(jobId: string, error: string): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const job = await lockJob(client, jobId);
      if (job.status !== "held" && job.status !== "running") return false;
      await client.query(
        `UPDATE wallets SET held_kobo = held_kobo - $2, balance_kobo = balance_kobo + $2, updated_at = now()
         WHERE user_id = $1`,
        [job.user_id, job.quoted_kobo],
      );
      await client.query(
        `INSERT INTO ledger_entries (user_id, kind, amount_kobo, job_id) VALUES ($1, 'release', $2, $3)`,
        [job.user_id, job.quoted_kobo, jobId],
      );
      await client.query(
        `UPDATE jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
        [jobId, error],
      );
      return true;
    });
  }

  /** Gives back what a succeeded job was charged (owner or support decision). */
  async refund(jobId: string, reason: string): Promise<boolean> {
    return inTransaction(this.pool, async (client) => {
      const job = await lockJob(client, jobId);
      if (job.status !== "succeeded") return false;
      const amount = job.charged_kobo ?? 0;
      await client.query(
        `UPDATE wallets SET balance_kobo = balance_kobo + $2, updated_at = now() WHERE user_id = $1`,
        [job.user_id, amount],
      );
      await client.query(
        `INSERT INTO ledger_entries (user_id, kind, amount_kobo, job_id, note) VALUES ($1, 'refund', $2, $3, $4)`,
        [job.user_id, amount, jobId, reason],
      );
      await client.query(`UPDATE jobs SET status = 'refunded' WHERE id = $1`, [jobId]);
      return true;
    });
  }

  /**
   * Credits a verified payment inside the caller's transaction: the paid amount
   * as 'topup' and any bundle bonus as 'bonus', so VAT reports can tell them apart.
   */
  async creditPayment(
    client: PoolClient,
    payment: { id: string; userId: string; amountKobo: number; creditKobo: number },
  ): Promise<void> {
    await client.query(
      "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [payment.userId],
    );
    const bonus = payment.creditKobo - payment.amountKobo;
    await client.query(
      `INSERT INTO ledger_entries (user_id, kind, amount_kobo, payment_id) VALUES ($1, 'topup', $2, $3)`,
      [payment.userId, payment.amountKobo, payment.id],
    );
    if (bonus > 0) {
      await client.query(
        `INSERT INTO ledger_entries (user_id, kind, amount_kobo, payment_id) VALUES ($1, 'bonus', $2, $3)`,
        [payment.userId, bonus, payment.id],
      );
    }
    await client.query(
      `UPDATE wallets SET balance_kobo = balance_kobo + $2, updated_at = now() WHERE user_id = $1`,
      [payment.userId, payment.creditKobo],
    );
  }

  /** Nightly check: every balance equals its ledger, and every held amount equals its open jobs. */
  async findMismatches(): Promise<Mismatch[]> {
    const { rows } = await this.pool.query(
      `SELECT w.user_id, w.balance_kobo, w.held_kobo,
              COALESCE(l.total, 0) AS ledger_kobo, COALESCE(j.total, 0) AS open_holds_kobo
       FROM wallets w
       LEFT JOIN (SELECT user_id, SUM(amount_kobo)::bigint AS total FROM ledger_entries GROUP BY user_id) l
         ON l.user_id = w.user_id
       LEFT JOIN (SELECT user_id, SUM(quoted_kobo)::bigint AS total FROM jobs
                  WHERE status IN ('held', 'running') GROUP BY user_id) j
         ON j.user_id = w.user_id
       WHERE w.balance_kobo <> COALESCE(l.total, 0) OR w.held_kobo <> COALESCE(j.total, 0)`,
    );
    return rows.map((r) => ({
      userId: r.user_id,
      balanceKobo: r.balance_kobo,
      ledgerKobo: r.ledger_kobo,
      heldKobo: r.held_kobo,
      openHoldsKobo: r.open_holds_kobo,
    }));
  }

  /** Releases holds stuck for longer than the limit (worker crashed or provider never answered). */
  async releaseStaleHolds(olderThanMinutes = 60): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT id FROM jobs WHERE status IN ('held', 'running')
       AND COALESCE(started_at, created_at) < now() - make_interval(mins => $1)`,
      [olderThanMinutes],
    );
    let released = 0;
    for (const { id } of rows) {
      if (await this.release(id, `timed out after ${olderThanMinutes} minutes`)) released++;
    }
    return released;
  }
}
