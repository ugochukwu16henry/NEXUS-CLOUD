"use client";

import { useEffect } from "react";

/** The browser's install offer (Chrome, Edge, Android); Safari never sends it. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __nexusInstallPrompt?: InstallPromptEvent | null;
  }
}

export const INSTALL_READY = "nexus:install-ready";

/**
 * Registers the service worker (installable app, offline page) and keeps the browser's install
 * offer, which can arrive before any Install button is on screen.
 */
export function PwaSetup() {
  useEffect(() => {
    // Service workers need HTTPS (or localhost).
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const keep = (event: Event) => {
      event.preventDefault();
      window.__nexusInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    const installed = () => {
      window.__nexusInstallPrompt = null;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
