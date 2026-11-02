import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus Cloud",
  description: "Personal AI-powered software engineering cloud",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers renders every page per request, so each response carries the CSP nonce
  // set by proxy.ts. A pre-rendered page would ship scripts without the nonce and be blocked.
  await headers();

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-nx-raised focus:px-3 focus:py-2"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
