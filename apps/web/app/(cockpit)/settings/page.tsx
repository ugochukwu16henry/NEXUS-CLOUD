import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/settings/profile-form";
import { RevokeSessionsForm } from "@/components/settings/revoke-sessions-form";
import { requireViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();
  const { data: sessions } = await supabase.rpc("my_sessions");

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-10 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section aria-labelledby="profile-heading" className="space-y-4">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Profile
        </h2>
        <ProfileForm email={viewer.email} displayName={viewer.displayName} />
      </section>

      <section aria-labelledby="security-heading" className="space-y-2">
        <h2 id="security-heading" className="text-lg font-semibold">
          Two-factor authentication
        </h2>
        <p className="text-sm text-nx-muted">
          {viewer.hasMfa
            ? "An authenticator app is set up."
            : "Not set up. Risk actions are blocked until it is."}
        </p>
        <Link href="/settings/security" className="text-sm text-nx-blue underline">
          Manage two-factor authentication
        </Link>
      </section>

      <section aria-labelledby="integrations-heading" className="space-y-2">
        <h2 id="integrations-heading" className="text-lg font-semibold">
          Integrations
        </h2>
        <p className="text-sm text-nx-muted">GitHub repositories, webhooks and their health.</p>
        <Link href="/settings/integrations" className="text-sm text-nx-blue underline">
          Manage integrations
        </Link>
      </section>

      <section aria-labelledby="models-heading" className="space-y-2">
        <h2 id="models-heading" className="text-lg font-semibold">
          Models and spend
        </h2>
        <p className="text-sm text-nx-muted">
          Monthly cap, default model per task, and the usage ledger.
        </p>
        <Link href="/settings/models" className="text-sm text-nx-blue underline">
          Manage models
        </Link>
      </section>

      <section aria-labelledby="sessions-heading" className="space-y-4">
        <h2 id="sessions-heading" className="text-lg font-semibold">
          Sessions
        </h2>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Your signed-in sessions</caption>
          <thead className="text-xs text-nx-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                Device
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Last active (UTC)
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                IP
              </th>
              <th scope="col" className="py-1 font-medium">
                Level
              </th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((session) => (
              <tr key={session.id} className="border-t border-nx-border">
                <td className="py-2 pr-4">
                  <span className="line-clamp-1">{session.user_agent ?? "Unknown device"}</span>
                  {session.is_current && <span className="text-xs text-nx-teal">This session</span>}
                </td>
                <td className="py-2 pr-4">
                  {dateFormat.format(new Date(session.updated_at ?? session.created_at))}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{session.ip ?? "—"}</td>
                <td className="py-2">{session.aal === "aal2" ? "MFA" : "Password-less"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <RevokeSessionsForm />
      </section>
    </main>
  );
}
