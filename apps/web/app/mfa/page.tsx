import type { Metadata } from "next";
import Link from "next/link";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { requireViewer } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Verify it's you · Nexus Cloud" };

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const viewer = await requireViewer();
  const next = safeRedirectPath((await searchParams).next);

  return (
    <main id="main" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-nx-border bg-nx-surface p-6">
        <h1 className="text-xl font-semibold">Verify it&apos;s you</h1>
        {viewer.hasMfa ? (
          <>
            <p className="mt-2 text-sm text-nx-muted">
              This action needs a second factor. Enter the code from your authenticator app.
            </p>
            <div className="mt-6">
              <MfaChallengeForm next={next} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-nx-muted">
              This action needs two-factor authentication, and you haven&apos;t set it up yet.
            </p>
            <Link
              href="/settings/security"
              className="mt-6 inline-block rounded-md bg-nx-teal px-3 py-2 text-sm font-semibold text-nx-bg"
            >
              Set up an authenticator app
            </Link>
          </>
        )}
        <Link href={next} className="mt-4 block text-sm text-nx-muted underline">
          Cancel
        </Link>
      </div>
    </main>
  );
}
