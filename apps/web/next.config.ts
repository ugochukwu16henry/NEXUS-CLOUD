import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@nexus/core",
    "@nexus/config",
    "@nexus/integrations",
    "@nexus/money",
    "@nexus/observability",
  ],
  poweredByHeader: false,
  // Baseline headers; the full CSP lands in Sprint 1 with auth (threat model T01/T04).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// Uploads source maps when SENTRY_AUTH_TOKEN is set (Vercel builds), then deletes them from the
// output so they are never served. Without the token the build still succeeds, just unsymbolicated.
export default withSentryConfig(nextConfig, {
  org: "zentrix-software-solutions",
  project: "nexus-cloud",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Browser events go to this same-origin route, which forwards them to Sentry. It keeps the CSP
  // at connect-src 'self'; proxy.ts skips it so signed-out pages can report errors too.
  tunnelRoute: "/monitoring",
  webpack: { treeshake: { removeDebugLogging: true } },
});
