"use client";

import { useEffect, useState } from "react";

const EVENT = "nexus:announce";

/**
 * Announces a message in the app-wide live region. Use it when the element that triggered an
 * action is about to re-mount (e.g. a board card moving to another column) and would lose its own
 * status message.
 */
export function announce(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** The single polite live region, rendered once by the app shell. */
export function Announcer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined;
    function onAnnounce(event: Event) {
      setMessage((event as CustomEvent<string>).detail);
      clearTimeout(clear);
      clear = setTimeout(() => setMessage(""), 8000);
    }
    window.addEventListener(EVENT, onAnnounce);
    return () => {
      window.removeEventListener(EVENT, onAnnounce);
      clearTimeout(clear);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="announcer"
      className={`fixed bottom-4 right-4 z-40 rounded-md border border-nx-ok/60 bg-nx-surface px-3 py-2 text-sm text-nx-ok shadow-lg ${
        message ? "" : "sr-only"
      }`}
    >
      {message}
    </div>
  );
}
