"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { Announcer } from "@/components/ui/announcer";
import { useShortcuts, type Shortcut } from "./use-shortcuts";

export type ShellViewer = {
  label: string;
  role: string;
  workspaceName: string;
  mfa: "verified" | "enrolled" | "off";
  canReadAudit: boolean;
  /** Shown the Business area; the page itself still asks for MFA. */
  canReadBusiness: boolean;
};

type NavItem = { href: string; label: string } | { label: string; sprint: number };
type NavGroup = { title: string; items: NavItem[] };

/** Business is the Nexus AI Hub side (ADR 0015); Engineering is the agent cockpit. */
function navGroups(viewer: ShellViewer): NavGroup[] {
  return [
    ...(viewer.canReadBusiness
      ? [{ title: "Business", items: [{ href: "/owner", label: "Owner dashboard" }] }]
      : []),
    {
      title: "Engineering",
      items: [
        { href: "/", label: "Cockpit" },
        { href: "/projects", label: "Projects" },
        { href: "/repositories", label: "Repositories" },
        { label: "Agents", sprint: 6 },
        { label: "Tests", sprint: 7 },
        { label: "Deployments", sprint: 8 },
        { label: "Client rooms", sprint: 9 },
        { label: "Marketing", sprint: 11 },
      ],
    },
    {
      title: "Account",
      items: [
        ...(viewer.canReadAudit ? [{ href: "/audit", label: "Audit log" }] : []),
        { href: "/settings", label: "Settings" },
      ],
    },
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

/** The navigation links, shared by the side panel (laptop) and the menu (phone). */
function NavList({ viewer, pathname }: { viewer: ShellViewer; pathname: string }) {
  return (
    <>
      {navGroups(viewer).map((group) => (
        <div key={group.title} className="mb-3">
          <p
            id={`nav-${group.title.toLowerCase()}`}
            className="px-4 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-nx-muted uppercase"
          >
            {group.title}
          </p>
          <ul aria-labelledby={`nav-${group.title.toLowerCase()}`}>
            {group.items.map((item) =>
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
        </div>
      ))}
    </>
  );
}

/** Phones and narrow windows get a menu button instead of a resizable side panel. */
function useSmallScreen(): boolean {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setSmall(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return small;
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
  const small = useSmallScreen();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-nx-border bg-nx-surface px-3 py-2 sm:gap-4 sm:px-4">
        {small && (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            className="rounded border border-nx-border px-2 py-0.5 text-sm"
          >
            Menu
          </button>
        )}
        <Link href="/" className="rounded-md">
          <Logo size={26} className="text-[15px]" />
        </Link>
        <span className="hidden text-sm text-nx-muted sm:inline">{viewer.workspaceName}</span>
        <span className={`ml-auto rounded border px-2 py-0.5 text-xs ${badge.className}`}>
          {badge.text}
        </span>
        <span className="hidden text-sm sm:inline">
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

      {small ? (
        <div className="relative min-h-0 flex-1">
          {menuOpen && (
            <nav
              id="nav-menu"
              aria-label="Primary"
              className="absolute inset-y-0 left-0 z-20 w-64 overflow-y-auto border-r border-nx-border bg-nx-surface py-2 shadow-lg"
            >
              <NavList viewer={viewer} pathname={pathname} />
            </nav>
          )}
          <div className="h-full min-h-0 overflow-auto">{children}</div>
        </div>
      ) : (
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
              <NavList viewer={viewer} pathname={pathname} />
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
      )}

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
