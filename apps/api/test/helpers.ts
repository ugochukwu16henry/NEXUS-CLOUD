import { Pool } from 'pg';
import { createPool, inTransaction } from '../src/db/db';
import { WalletService } from '../src/wallet/wallet.service';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/zentrix_test';

export function testPool(): Pool {
  return createPool(TEST_DATABASE_URL);
}

/** Empties user data; prices, rates and bundles from the seed migration stay. */
export async function resetData(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE ledger_entries, jobs, payments, wallets, users CASCADE');
}

export async function createUser(pool: Pool, email = `user-${Math.random().toString(36).slice(2)}@example.com`) {
  const { rows } = await pool.query(`INSERT INTO users (full_name, email) VALUES ('Test User', $1) RETURNING id`, [
    email,
  ]);
  return rows[0].id as string;
}

/** Adds money the way a verified top-up does. */
export async function fund(pool: Pool, wallet: WalletService, userId: string, amountKobo: number): Promise<void> {
  await inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO payments (user_id, gateway, gateway_reference, amount_kobo, credit_kobo, status)
       VALUES ($1, 'paystack', $2, $3, $3, 'success') RETURNING id`,
      [userId, `TEST-${Math.random()}`, amountKobo],
    );
    await wallet.creditPayment(client, { id: rows[0].id, userId, amountKobo, creditKobo: amountKobo });
  });
}
