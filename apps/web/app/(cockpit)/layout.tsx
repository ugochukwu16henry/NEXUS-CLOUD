import { can } from "@nexus/auth";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireViewer } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function CockpitLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();

  // Nexus Cloud is the owner's alone (ADR 0020): any other signed-in account gets no access.
  if (!viewer.role || !viewer.workspaceName) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-sm rounded-lg border border-nx-border bg-nx-surface p-6">
          <h1 className="text-xl font-semibold">No access</h1>
          <p className="mt-2 text-sm text-nx-muted">
            You&apos;re signed in as {viewer.email}. Nexus Cloud is a private workspace for its
            owner only.
          </p>
          <div className="mt-6">
            <SignOutButton className="rounded border border-nx-border px-3 py-1.5 text-sm" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      viewer={{
        label: viewer.displayName ?? viewer.email,
        role: viewer.role,
        workspaceName: viewer.workspaceName,
        mfa: viewer.aal === "aal2" ? "verified" : viewer.hasMfa ? "enrolled" : "off",
        canReadAudit: can({ role: viewer.role, aal: viewer.aal }, "audit:read"),
      }}
    >
      {children}
    </AppShell>
  );
}
