import { can } from "@nexus/auth";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireViewer } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function CockpitLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();

  // Signed in but not (yet) a member of any workspace, e.g. an invite still being set up.
  if (!viewer.role || !viewer.workspaceName) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-sm rounded-lg border border-nx-border bg-nx-surface p-6">
          <h1 className="text-xl font-semibold">No workspace access yet</h1>
          <p className="mt-2 text-sm text-nx-muted">
            You&apos;re signed in as {viewer.email}, but you haven&apos;t been added to a workspace.
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
