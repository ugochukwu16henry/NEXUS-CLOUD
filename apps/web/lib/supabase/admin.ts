import "server-only";
import type { Database } from "@nexus/db";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Secret-key client that bypasses RLS. Used only for audit writes, the owner bootstrap and the
 * sign-up allowlist. Never pass its results to the browser without filtering.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
