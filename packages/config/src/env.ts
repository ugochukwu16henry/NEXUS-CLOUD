import { z } from "zod";

/** Variables safe to expose to the browser. Only NEXT_PUBLIC_* names belong here. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  /** Supabase publishable key (sb_publishable_…); RLS limits what it can do. */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Sentry DSN for the web app. Public by design: it can only submit events. */
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

/** Server and worker variables (ADR 0004, 0007, 0008). Must never be imported into client code. */
export const serverEnvSchema = publicEnvSchema.extend({
  /** Supabase secret key (sb_secret_…); bypasses RLS, so server and worker only. */
  SUPABASE_SECRET_KEY: z.string().min(1),
  /** The single owner (ADR 0012). Only this email can create an account without an invite. */
  NEXUS_OWNER_EMAIL: z.email().transform((email) => email.toLowerCase()),
  NEXUS_GLOBAL_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(20),
  /** Worker error reporting (the web app uses NEXT_PUBLIC_SENTRY_DSN). */
  SENTRY_DSN: z.url().optional(),
  /** GitHub App (Sprint 3, docs/runbooks/github-app.md). The integration is off until all are set. */
  GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
  GITHUB_APP_SLUG: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  /** PEM private key; may be stored on one line with literal 
. */
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(20).optional(),
  /** Overridden only by tests (a local fake GitHub). */
  GITHUB_API_URL: z.url().default("https://api.github.com"),
  GITHUB_WEB_URL: z.url().default("https://github.com"),
  XAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Names that must never appear in a browser bundle. Used by scripts/check-bundle-secrets.mjs. */
export const SERVER_ONLY_ENV_NAMES = Object.keys(serverEnvSchema.shape).filter(
  (name) => !name.startsWith("NEXT_PUBLIC_"),
);

/**
 * `.env.example` ships every key with an empty value, so a copied file contains `KEY=` lines.
 * Treat those as unset: an empty provider key must not look configured, and an empty budget
 * must fall back to the default instead of failing validation.
 */
function dropEmptyValues(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value?.trim()));
}

function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
  label: string,
) {
  const result = schema.safeParse(dropEmptyValues(source));
  if (!result.success) {
    // Report variable names only, never values.
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid ${label} environment: ${names}`);
  }
  return result.data as z.infer<T>;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return parse(serverEnvSchema, source, "server");
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return parse(publicEnvSchema, source, "public");
}
