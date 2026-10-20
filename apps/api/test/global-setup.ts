import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './helpers';

// Recreates the test database and applies every migration.
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
  execFileSync(process.execPath, [join(__dirname, '../../../packages/db/migrate.mjs')], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
