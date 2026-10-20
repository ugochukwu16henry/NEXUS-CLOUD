import { Pool } from 'pg';
import { PricingService } from '../src/pricing/pricing.service';
import { InsufficientFundsError, WalletService } from '../src/wallet/wallet.service';
import { createUser, fund, resetData, testPool } from './helpers';

describe('WalletService money path', () => {
  let pool: Pool;
  let wallet: WalletService;
  let pricing: PricingService;
  let userId: string;

  const newVideoJob = async (key?: string) =>
    wallet.createJob(userId, 'studio', await pricing.quote('video_standard', { units: 5 }), key); // N900

  beforeAll(() => {
    pool = testPool();
    wallet = new WalletService(pool);
    pricing = new PricingService(pool);
  });
  beforeEach(async () => {
    await resetData(pool);
    userId = await createUser(pool);
  });
  afterEach(async () => expect(await wallet.findMismatches()).toEqual([]));
  afterAll(() => pool.end());

  it('holds, then captures the charge', async () => {
    await fund(pool, wallet, userId, 200_000);
    const jobId = await newVideoJob();

    expect(await wallet.hold(jobId)).toBe(true);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 110_000, heldKobo: 90_000 });

    expect(await wallet.markRunning(jobId)).toBe(true);
    expect(await wallet.capture(jobId, { chargedKobo: 90_000, costUsdMicros: 250_000, videoSeconds: 5 })).toBe(true);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 110_000, heldKobo: 0 });

    const { rows } = await pool.query('SELECT status, charged_kobo FROM jobs WHERE id = $1', [jobId]);
    expect(rows[0]).toEqual({ status: 'succeeded', charged_kobo: 90_000 });
  });

  it('returns the unused part of a metered text quote', async () => {
    await fund(pool, wallet, userId, 50_000);
    const quote = await pricing.quote('text_student', { inputTokens: 2000, outputTokens: 4000 });
    const jobId = await wallet.createJob(userId, 'academy', quote);
    await wallet.hold(jobId);
    await wallet.capture(jobId, { chargedKobo: 1000, costUsdMicros: 600, inputTokens: 2000, outputTokens: 1500 });
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 49_000, heldKobo: 0 });
  });

  it('never charges more than the quote', async () => {
    await fund(pool, wallet, userId, 100_000);
    const jobId = await newVideoJob();
    await wallet.hold(jobId);
    await wallet.capture(jobId, { chargedKobo: 999_999, costUsdMicros: 250_000 });
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 10_000, heldKobo: 0 });
  });

  it('releases the whole hold when the provider fails', async () => {
    await fund(pool, wallet, userId, 100_000);
    const jobId = await newVideoJob();
    await wallet.hold(jobId);
    expect(await wallet.release(jobId, 'provider timeout')).toBe(true);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 100_000, heldKobo: 0 });
  });

  it('refuses a hold the balance cannot cover and moves no money', async () => {
    await fund(pool, wallet, userId, 50_000);
    const jobId = await newVideoJob();
    await expect(wallet.hold(jobId)).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 50_000, heldKobo: 0 });
    const { rows } = await pool.query('SELECT status FROM jobs WHERE id = $1', [jobId]);
    expect(rows[0].status).toBe('quoted');
  });

  it('makes every step safe to retry', async () => {
    await fund(pool, wallet, userId, 200_000);
    const jobId = await newVideoJob();
    expect(await wallet.hold(jobId)).toBe(true);
    expect(await wallet.hold(jobId)).toBe(false);
    expect(await wallet.capture(jobId, { chargedKobo: 90_000, costUsdMicros: 250_000 })).toBe(true);
    expect(await wallet.capture(jobId, { chargedKobo: 90_000, costUsdMicros: 250_000 })).toBe(false);
    expect(await wallet.release(jobId, 'late failure')).toBe(false);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 110_000, heldKobo: 0 });
  });

  it('cannot overspend under concurrent holds', async () => {
    await fund(pool, wallet, userId, 200_000); // enough for two N900 clips, not three
    const jobs = await Promise.all([newVideoJob(), newVideoJob(), newVideoJob()]);
    const results = await Promise.allSettled(jobs.map((id) => wallet.hold(id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 20_000, heldKobo: 180_000 });
    await Promise.all(jobs.map((id) => wallet.release(id, 'cleanup')));
  });

  it('turns a double click into one job', async () => {
    const first = await newVideoJob('click-1');
    const second = await newVideoJob('click-1');
    expect(second).toBe(first);
    const other = await createUser(pool);
    const quote = await pricing.quote('video_standard', { units: 5 });
    await expect(wallet.createJob(other, 'studio', quote, 'click-1')).rejects.toThrow('idempotency key');
  });

  it('refunds a succeeded job once', async () => {
    await fund(pool, wallet, userId, 100_000);
    const jobId = await newVideoJob();
    await wallet.hold(jobId);
    await wallet.capture(jobId, { chargedKobo: 90_000, costUsdMicros: 250_000 });
    expect(await wallet.refund(jobId, 'blurry output')).toBe(true);
    expect(await wallet.refund(jobId, 'blurry output')).toBe(false);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 100_000, heldKobo: 0 });
  });

  it('releases holds stuck for over an hour', async () => {
    await fund(pool, wallet, userId, 100_000);
    const jobId = await newVideoJob();
    await wallet.hold(jobId);
    await wallet.markRunning(jobId);
    expect(await wallet.releaseStaleHolds(60)).toBe(0);
    await pool.query(`UPDATE jobs SET started_at = now() - interval '61 minutes' WHERE id = $1`, [jobId]);
    expect(await wallet.releaseStaleHolds(60)).toBe(1);
    expect(await wallet.getWallet(userId)).toMatchObject({ balanceKobo: 100_000, heldKobo: 0 });
  });

  it('keeps the ledger append-only', async () => {
    await fund(pool, wallet, userId, 50_000);
    await expect(pool.query('UPDATE ledger_entries SET amount_kobo = 1')).rejects.toThrow('append-only');
    await expect(pool.query('DELETE FROM ledger_entries')).rejects.toThrow('append-only');
  });

  it('reports a wallet that no longer matches its ledger', async () => {
    await fund(pool, wallet, userId, 50_000);
    await pool.query('UPDATE wallets SET balance_kobo = balance_kobo + 1 WHERE user_id = $1', [userId]);
    expect(await wallet.findMismatches()).toEqual([
      { userId, balanceKobo: 50_001, ledgerKobo: 50_000, heldKobo: 0, openHoldsKobo: 0 },
    ]);
    await pool.query('UPDATE wallets SET balance_kobo = balance_kobo - 1 WHERE user_id = $1', [userId]);
  });
});
