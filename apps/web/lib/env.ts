import "server-only";
import { parsePublicEnv, parseServerEnv, type PublicEnv, type ServerEnv } from "@nexus/config";

// Parsed lazily so `next build` and unit tests don't need real values.
let serverEnv: ServerEnv | undefined;
let publicEnv: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
  serverEnv ??= parseServerEnv(process.env);
  return serverEnv;
}

export function getPublicEnv(): PublicEnv {
  publicEnv ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return publicEnv;
}

/** GitHub sign-in is shown only when the provider is configured (supabase/config.toml). */
export function isGitHubSignInEnabled(): boolean {
  return process.env.NEXUS_AUTH_GITHUB_ENABLED === "true";
}
