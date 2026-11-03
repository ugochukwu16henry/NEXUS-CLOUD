/** A recorded model reply is only allowed against a local Supabase, never a hosted project. */
export function allowFixtureMode(flag: string | undefined, supabaseUrl: string): boolean {
  if (flag !== "1") return false;
  try {
    const host = new URL(supabaseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
