import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Session cookies are HttpOnly: auth happens on the server only and the browser never holds tokens
 * (ADR 0013, threat model T01). SameSite=Lax blocks cross-site POSTs; Secure outside local dev.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
