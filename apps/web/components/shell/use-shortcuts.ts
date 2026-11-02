"use client";

import { useEffect } from "react";

export type Shortcut = {
  /** e.g. "ctrl+b", "ctrl+shift+i", "?" — ctrl also matches ⌘ on macOS. */
  keys: string;
  description: string;
  run: () => void;
};

function matches(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split("+");
  const key = parts.at(-1);
  const wantCtrl = parts.includes("ctrl");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  if ((event.ctrlKey || event.metaKey) !== wantCtrl || event.altKey !== wantAlt) return false;
  // "?" is produced with shift on most layouts, so only check shift for letter keys.
  if (key && key.length === 1 && /[a-z]/.test(key) && event.shiftKey !== wantShift) return false;
  return event.key.toLowerCase() === key;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Registers global keyboard shortcuts. Plain-key shortcuts are ignored while typing in a field. */
export function useShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const usesModifier = /ctrl|alt/.test(shortcut.keys);
        if (!usesModifier && isTyping(event.target)) continue;
        if (matches(event, shortcut.keys)) {
          event.preventDefault();
          shortcut.run();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
