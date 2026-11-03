/**
 * Content Security Policy and related headers (threat model T01/T03/T04). Kept free of Next.js
 * imports so it can be unit-tested directly.
 */
export type CspOptions = {
  nonce: string;
  isDev: boolean;
  supabaseUrl: string;
};

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js tags its own scripts with the nonce; 'strict-dynamic' lets them load chunks.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Panels and Next.js set inline style attributes; styles cannot run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    // data: is needed for the TOTP QR code returned by Supabase Auth.
    // Attachment thumbnails are short-lived signed URLs from Supabase Storage.
    "img-src": ["'self'", "data:", "blob:", supabaseOrigin],
    "font-src": ["'self'"],
    // Sessions never leave the server (HttpOnly, ADR 0013). The one direct call is an upload to a
    // single-object signed URL in Supabase Storage (ADR 0017).
    "connect-src": ["'self'", supabaseOrigin, ...(isDev ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // OAuth sign-in navigates to Supabase Auth, which forwards to GitHub.
    "form-action": ["'self'", supabaseUrl, "https://github.com"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF check for route handlers: state-changing requests must come from our own origin. Server
 * actions get the same check from Next.js; this covers `/api/*` routes added in later sprints.
 */
export function isCrossSiteMutation(
  method: string,
  origin: string | null,
  host: string | null,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Webhook endpoints authenticate each request by its signature instead of a session or an Origin
 * header (GitHub sends neither), so they skip the session redirect and the CSRF check.
 */
export function isSignedWebhookPath(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/");
}

/** Paths reachable without a session. Everything else redirects to /login. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/") || isSignedWebhookPath(pathname);
}
