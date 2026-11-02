import type { Database } from "@nexus/db";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { buildCsp, createNonce, isCrossSiteMutation, isPublicPath } from "@/lib/security-headers";

const CORRELATION_HEADER = "x-correlation-id";

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

  // Never trust an incoming correlation ID; each request gets its own.
  const correlationId = crypto.randomUUID();
  const nonce = createNonce();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV === "development", supabaseUrl });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from this request header and applies it to its own scripts.
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
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
    },
  );

  // Refreshes an expiring session and tells us whether there is one.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && !isPublicPath(pathname)) {
    const next =
      pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    response = redirectTo(`/login${next}`);
  } else if (user && pathname === "/login") {
    response = redirectTo("/");
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
