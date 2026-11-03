import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus Cloud",
  description: "Personal AI-powered software engineering cloud",
  applicationName: "Nexus Cloud",
  // Installed on an iPhone, the app opens full screen with its own name under the icon.
  appleWebApp: { capable: true, title: "Nexus", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Content reaches the screen edges; the shell pads for the notch and the home indicator.
  viewportFit: "cover",
};

// Self-hosted by Next.js at build time (CSP font-src 'self'); the token CSS reads these variables.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers renders every page per request, so each response carries the CSP nonce
  // set by proxy.ts. A pre-rendered page would ship scripts without the nonce and be blocked.
  await headers();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-nx-raised focus:px-3 focus:py-2"
        >
          Skip to main content
        </a>
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
