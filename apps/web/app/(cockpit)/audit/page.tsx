import { can } from "@nexus/auth";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "UTC",
});

const RESULT_STYLES = {
  success: "text-nx-ok",
  denied: "text-nx-warn",
  error: "text-nx-danger",
} as const;

export default async function AuditPage() {
  const viewer = await requireViewer();
  if (!can({ role: viewer.role, aal: viewer.aal }, "audit:read")) {
    return (
      <main id="main" className="p-6">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p role="alert" className="mt-2 text-sm text-nx-danger">
          Only the workspace owner can view the audit log.
        </p>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  // RLS limits this to the owner's workspace plus system-level events.
  const [{ data: events }, { data: profiles }] = await Promise.all([
    supabase
      .from("audit_events")
      .select(
        "id, created_at, actor_id, actor_type, action, target_type, target_id, result, correlation_id",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("profiles").select("id, email, display_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email]));

  return (
    <main id="main" className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-nx-muted">
          Latest 100 events. Entries cannot be edited or deleted.
        </p>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Audit events">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead className="text-xs text-nx-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                Time (UTC)
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Actor
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Action
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Target
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Result
              </th>
              <th scope="col" className="py-1 font-medium">
                Correlation ID
              </th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((event) => (
              <tr key={event.id} className="border-t border-nx-border">
                <td className="whitespace-nowrap py-2 pr-4">
                  {dateFormat.format(new Date(event.created_at))}
                </td>
                <td className="py-2 pr-4">
                  {event.actor_id ? (names.get(event.actor_id) ?? "Former user") : event.actor_type}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{event.action}</td>
                <td className="py-2 pr-4 text-xs text-nx-muted">
                  {event.target_type ? `${event.target_type}:${event.target_id ?? ""}` : "—"}
                </td>
                <td
                  className={`py-2 pr-4 ${RESULT_STYLES[event.result as keyof typeof RESULT_STYLES]}`}
                >
                  {event.result}
                </td>
                <td className="py-2 font-mono text-xs text-nx-muted">
                  {event.correlation_id.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
