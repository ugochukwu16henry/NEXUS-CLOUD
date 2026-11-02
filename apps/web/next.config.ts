import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nexus/core", "@nexus/config"],
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

export default nextConfig;
