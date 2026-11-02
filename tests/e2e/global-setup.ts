import { rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { STRANGER_EMAIL, testEnv } from "./support/env";
import { clearMailbox } from "./support/mailbox";

/**
 * Starts every run from a known state: no owner account (so the first sign-in bootstraps it, with
 * no MFA enrolled) and an empty mailbox. Runs only against local Supabase.
 */
export default async function globalSetup() {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(testEnv.supabaseUrl)) {
    throw new Error(`E2E setup deletes users; refusing to run against ${testEnv.supabaseUrl}`);
  }

  const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  for (const user of data.users) {
    if (user.email === testEnv.ownerEmail || user.email === STRANGER_EMAIL) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }
  }
  await clearMailbox();
  // The owner is recreated without MFA, so a secret saved by an earlier run is stale.
  rmSync(join(__dirname, ".state"), { recursive: true, force: true });
}
