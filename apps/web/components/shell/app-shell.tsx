"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, type ReactNode } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Announcer } from "@/components/ui/announcer";
import { useShortcuts, type Shortcut } from "./use-shortcuts";

export type ShellViewer = {
  label: string;
  role: string;
  workspaceName: string;
  mfa: "verified" | "enrolled" | "off";
  canReadAudit: boolean;
};

type NavItem = { href: string; label: string } | { label: string; sprint: number };

function navItems(canReadAudit: boolean): NavItem[] {
  return [
    { href: "/", label: "Cockpit" },
    { href: "/projects", label: "Projects" },
    { label: "Repositories", sprint: 3 },
    { label: "Agents", sprint: 6 },
    { label: "Tests", sprint: 7 },
    { label: "Deployments", sprint: 8 },
    { label: "Client rooms", sprint: 9 },
    { label: "Marketing", sprint: 11 },
    ...(canReadAudit ? [{ href: "/audit", label: "Audit log" }] : []),
    { href: "/settings", label: "Settings" },
  ];
}

const MFA_BADGE = {
  verified: { text: "MFA verified", className: "border-nx-ok/60 text-nx-ok" },
  enrolled: { text: "MFA on", className: "border-nx-teal/60 text-nx-teal" },
  off: { text: "MFA off", className: "border-nx-warn/60 text-nx-warn" },
} as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ viewer, children }: { viewer: ShellViewer; children: ReactNode }) {
  const pathname = usePathname();
  const navPanel = usePanelRef();
  const shortcutsDialog = useRef<HTMLDialogElement>(null);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: "ctrl+b",
        description: "Show or hide navigation",
        run: () => {
          const panel = navPanel.current;
          if (panel?.isCollapsed()) panel.expand();
          else panel?.collapse();
        },
      },
      {
        keys: "?",
        description: "Show keyboard shortcuts",
        run: () => shortcutsDialog.current?.showModal(),
      },
    ],
    [navPanel],
  );
  useShortcuts(shortcuts);

  const badge = MFA_BADGE[viewer.mfa];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-nx-border bg-nx-surface px-4 py-2">
        <Link href="/" className="font-semibold tracking-wide text-nx-teal">
          NEXUS CLOUD
        </Link>
        <span className="text-sm text-nx-muted">{viewer.workspaceName}</span>
        <span className={`ml-auto rounded border px-2 py-0.5 text-xs ${badge.className}`}>
          {badge.text}
        </span>
        <span className="text-sm">
          {viewer.label} <span className="text-nx-muted">· {viewer.role}</span>
        </span>
        <button
          type="button"
          onClick={() => shortcutsDialog.current?.showModal()}
          className="rounded border border-nx-border px-2 py-0.5 text-xs text-nx-muted"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
        <SignOutButton className="rounded border border-nx-border px-3 py-1 text-xs" />
      </header>

      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel
          id="nav"
          panelRef={navPanel}
          defaultSize="14"
          minSize="10"
          maxSize="25"
          collapsible
          collapsedSize="0"
        >
          <nav aria-label="Primary" className="h-full overflow-y-auto bg-nx-surface py-2">
            <ul>
              {navItems(viewer.canReadAudit).map((item) =>
                "href" in item ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={`block px-4 py-1.5 text-sm ${
                        isActive(pathname, item.href)
                          ? "bg-nx-raised text-nx-text"
                          : "text-nx-muted hover:text-nx-text"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  // Not built yet: plain text (not a link), labelled with the sprint that delivers it.
                  <li
                    key={item.label}
                    className="flex justify-between px-4 py-1.5 text-sm text-nx-muted"
                  >
                    {item.label}
                    <span className="text-xs italic">Sprint {item.sprint}</span>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </Panel>
        <Separator
          aria-label="Resize navigation"
          className="w-1 bg-nx-border transition-colors hover:bg-nx-blue data-[separator=active]:bg-nx-blue"
        />
        <Panel id="content" minSize="40">
          <div className="h-full min-h-0 overflow-auto">{children}</div>
        </Panel>
      </Group>

      <Announcer />

      <dialog
        ref={shortcutsDialog}
        aria-labelledby="shortcuts-title"
        className="m-auto rounded-lg border border-nx-border bg-nx-surface p-6 text-nx-text backdrop:bg-black/60"
      >
        <h2 id="shortcuts-title" className="text-lg font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {[
            ["Ctrl + B", "Show or hide navigation"],
            ["Ctrl + J", "Show or hide the console (cockpit)"],
            ["Ctrl + I", "Show or hide the AI panel (cockpit)"],
            ["Arrow keys on a divider", "Resize panels"],
            ["?", "Show this list"],
          ].map(([keys, description]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-nx-border px-1.5 font-mono text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-nx-muted">{description}</dd>
            </div>
          ))}
        </dl>
        <form method="dialog" className="mt-6 text-right">
          <button className="rounded border border-nx-border px-3 py-1 text-sm">Close</button>
        </form>
      </dialog>
    </div>
  );
}
