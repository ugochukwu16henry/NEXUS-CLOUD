"use client";

import { useEffect, useState } from "react";
import { INSTALL_READY } from "./pwa-setup";

type Mode = "unknown" | "installed" | "prompt" | "ios" | "manual";

function detect(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (window.__nexusInstallPrompt) return "prompt";
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "manual";
}

/**
 * Install Nexus Cloud as an app: one tap where the browser supports it (Android, Chrome, Edge),
 * step-by-step instructions on iPhone and iPad (Safari has no install button for websites).
 */
export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("unknown");

  useEffect(() => {
    const update = () => setMode(detect());
    update();
    window.addEventListener(INSTALL_READY, update);
    return () => window.removeEventListener(INSTALL_READY, update);
  }, []);

  if (mode === "unknown") return null;
  if (mode === "installed") {
    return compact ? null : (
      <p className="text-sm text-nx-ok">You&apos;re using the installed Nexus Cloud app.</p>
    );
  }
  if (mode === "prompt") {
    return (
      <button
        type="button"
        className="rounded-md bg-nx-teal px-3 py-1.5 text-sm font-semibold text-nx-bg"
        onClick={async () => {
          const offer = window.__nexusInstallPrompt;
          if (!offer) return;
          await offer.prompt();
          await offer.userChoice;
          window.__nexusInstallPrompt = null;
          setMode(detect());
        }}
      >
        Install app
      </button>
    );
  }
  if (mode === "ios") {
    return (
      <div className="space-y-1 text-sm">
        <p className="font-medium">Install on iPhone or iPad</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-nx-muted">
          <li>Open this page in Safari.</li>
          <li>
            Tap the Share button <span aria-hidden="true">(square with an arrow)</span>.
          </li>
          <li>Choose Add to Home Screen, then Add.</li>
        </ol>
      </div>
    );
  }
  return compact ? null : (
    <p className="text-sm text-nx-muted">
      To install, open your browser&apos;s menu and choose Install app or Add to Home screen. Chrome
      and Edge on a computer show an install icon in the address bar.
    </p>
  );
}
