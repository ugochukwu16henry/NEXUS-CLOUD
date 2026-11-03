import "server-only";
import { GitHubClient, normalizePrivateKey } from "@nexus/integrations";
import { getServerEnv } from "@/lib/env";

const REQUIRED = [
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
] as const;

export type GitHubApp =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      client: GitHubClient;
      slug: string;
      webUrl: string;
      webhookSecret: string;
    };

/** The GitHub App, or which settings are missing (the integration stays off until all are set). */
export function getGitHubApp(): GitHubApp {
  const env = getServerEnv();
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) return { configured: false, missing };
  return {
    configured: true,
    client: new GitHubClient({
      appId: env.GITHUB_APP_ID!,
      privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
      clientId: env.GITHUB_APP_CLIENT_ID!,
      clientSecret: env.GITHUB_APP_CLIENT_SECRET!,
      apiUrl: env.GITHUB_API_URL,
      webUrl: env.GITHUB_WEB_URL,
    }),
    slug: env.GITHUB_APP_SLUG!,
    webUrl: env.GITHUB_WEB_URL,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET!,
  };
}

/** Short-lived cookie that ties the install redirect back to the session that started it (CSRF). */
export const INSTALL_STATE_COOKIE = "nx_github_install";

/** A message safe to show the owner for a failed GitHub call. */
export function gitHubFailureMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: number }).status);
    if (status === 0 || status >= 500)
      return "GitHub isn't responding right now. Try again shortly.";
    if (status === 403 || status === 429)
      return "GitHub's rate limit was reached. Try again in a few minutes.";
    if (status === 404) return "GitHub can't find that repository for this installation.";
  }
  return "GitHub refused the request. Check the app's permissions on GitHub.";
}
