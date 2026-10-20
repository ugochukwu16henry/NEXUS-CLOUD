import { Pool } from 'pg';
import { testPool } from './helpers';

describe('public schema lockdown (Supabase Data API)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = testPool();
  });
  afterAll(() => pool.end());

  it('has row-level security on every table', async () => {
    const { rows } = await pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('shows an API role nothing, even with table privileges', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE ROLE zentrix_api_probe NOLOGIN NOBYPASSRLS');
      await client.query('GRANT USAGE ON SCHEMA public TO zentrix_api_probe');
      await client.query('GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO zentrix_api_probe');
      const { rows: users } = await client.query(
        `INSERT INTO users (full_name, email) VALUES ('Probe', 'probe@example.com') RETURNING id`,
      );
      await client.query('INSERT INTO wallets (user_id, balance_kobo) VALUES ($1, 100000)', [users[0].id]);

      await client.query('SET LOCAL ROLE zentrix_api_probe');
      for (const table of ['users', 'wallets', 'products', 'bundles']) {
        const { rows } = await client.query(`SELECT * FROM ${table}`);
        expect({ table, rows: rows.length }).toEqual({ table, rows: 0 });
      }
      const updated = await client.query('UPDATE wallets SET balance_kobo = 999999999');
      expect(updated.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
