import { Pool, type PoolClient, types } from "pg";

export const PG_POOL = Symbol("PG_POOL");

// BIGINT (kobo, micros) comes back from pg as a string. Convert it to a number,
// refusing anything outside the range a JavaScript number holds exactly.
types.setTypeParser(types.builtins.INT8, (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`BIGINT ${value} is out of safe range`);
  return n;
});

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

/** Runs fn in one short transaction. Never call a provider or gateway inside fn. */
export async function inTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
