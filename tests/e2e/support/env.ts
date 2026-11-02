import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Reads apps/web/.env.local (written by scripts/write-local-env.mjs) so tests use the same setup. */
function loadEnvFile(): Record<string, string> {
  const text = readFileSync(join(__dirname, "..", "..", "..", "apps", "web", ".env.local"), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

const file = loadEnvFile();

export const testEnv = {
  supabaseUrl: file.NEXT_PUBLIC_SUPABASE_URL!,
  secretKey: file.SUPABASE_SECRET_KEY!,
  ownerEmail: file.NEXUS_OWNER_EMAIL!,
  mailpitUrl: file.MAILPIT_URL!,
};

/** An address that is never invited; sign-in must not create an account for it. */
export const STRANGER_EMAIL = "stranger@nexus.test";
