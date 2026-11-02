import type { Database } from "@nexus/db";
import { createLogger } from "@nexus/observability";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { buildCsp, createNonce, isCrossSiteMutation, isPublicPath } from "@/lib/security-headers";

const CORRELATION_HEADER = "x-correlation-id";
const logger = createLogger({ service: "web-proxy" });

/**
 * Runs before every page request: refreshes the Supabase session cookie, sends signed-out users to
 * /login, and sets the CSP nonce and correlation ID (Next.js 16 proxy, formerly middleware).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") &&
    isCrossSiteMutation(request.method, request.headers.get("origin"), request.headers.get("host"))
  ) {
    return new NextResponse("Cross-site request blocked", { status: 403 });
  }

  // NEXT_PUBLIC_* values are inlined at build time: if they were added after the build, the
  // deployment must be rebuilt. Fail with a clear message instead of an opaque 500.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !supabaseKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ].filter(Boolean);
    logger.error("Supabase environment missing; set the variables and redeploy", { missing });
    return new NextResponse("Service misconfigured", { status: 503 });
  }

  // Never trust an incoming correlation ID; each request gets its own.
  const correlationId = crypto.randomUUID();
  const nonce = createNonce();
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV === "development", supabaseUrl });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from this request header and applies it to its own scripts.
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
        }
      },
    },
  });

  // Refreshes an expiring session and verifies its JWT locally against the project's published
  // signing keys (no Auth server round trip). Pages and actions still call getUser(), which also
  // catches sessions revoked by "sign out everywhere".
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? claimsData.claims : null;

  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && !isPublicPath(pathname)) {
    const next =
      pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    response = redirectTo(`/login${next}`);
  }
  // Signed-in users are sent away from /login by the login page itself, which checks with the Auth
  // server. Doing it here from the locally verified JWT would loop for a session that was revoked
  // elsewhere: the page would send it back to /login and the proxy back to /.

  response.headers.set("content-security-policy", csp);
  response.headers.set(CORRELATION_HEADER, correlationId);
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

export const config = {
  // /monitoring is the Sentry tunnel (next.config.ts): it must work without a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring$|.*\\.(?:png|jpg|svg|ico|webp)$).*)",
  ],
};
