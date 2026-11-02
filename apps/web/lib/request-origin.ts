import "server-only";
import { headers } from "next/headers";

/**
 * Origin of the current request, used to build auth redirect URLs. Supabase only redirects to
 * URLs on its allowlist (supabase/config.toml), so a forged Host header cannot redirect elsewhere.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
