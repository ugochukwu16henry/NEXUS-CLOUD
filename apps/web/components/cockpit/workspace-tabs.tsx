"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type WorkspaceTab = { id: string; label: string; content: ReactNode };

/** ARIA tabs pattern: arrow keys move between tabs, Home/End jump to the ends. */
export function WorkspaceTabs({ tabs }: { tabs: WorkspaceTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function focusTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Workspace views" className="flex border-b border-nx-border">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
            className={`px-4 py-2 text-sm ${
              index === active
                ? "border-b-2 border-nx-teal text-nx-text"
                : "text-nx-muted hover:text-nx-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== active}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto p-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
