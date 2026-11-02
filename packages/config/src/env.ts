import { z } from "zod";

/** Variables safe to expose to the browser. Only NEXT_PUBLIC_* names belong here. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Server and worker variables (ADR 0004, 0007, 0008). Must never be imported into client code. */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXUS_GLOBAL_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(20),
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

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(dropEmptyValues(source));
  if (!result.success) {
    // Report variable names only, never values.
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }
  return result.data;
}
