import type { Metadata } from "next";
import { TotpEnrollment } from "@/components/settings/totp-enrollment";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Two-factor authentication · Nexus Cloud" };

export default async function SecurityPage() {
  const viewer = await requireViewer();

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Two-factor authentication</h1>
      <p className="text-sm text-nx-muted">
        Risk actions such as signing out every device, approving releases and managing members need
        a code from an authenticator app in addition to your sign-in link.
      </p>
      {viewer.hasMfa ? (
        <p role="status" className="text-sm text-nx-ok">
          An authenticator app is set up
          {viewer.aal === "aal2" ? " and verified for this session." : "."}
        </p>
      ) : (
        <TotpEnrollment />
      )}
    </main>
  );
}
