import type { Metadata } from "next";
import { can } from "@nexus/auth";
import { ActionForm } from "@/components/ui/action-form";
import { buttonSecondary } from "@/components/ui/fields";
import { requireViewer } from "@/lib/auth/session";
import { getGitHubApp } from "@/lib/github/app";
import {
  getGitHubIntegration,
  integrationHealth,
  listRecentDeliveries,
} from "@/lib/github/queries";
import { retryDelivery, startGitHubInstall } from "./actions";

export const metadata: Metadata = { title: "Integrations · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const NOTICES: Record<string, { text: string; tone: "error" | "info" }> = {
  connected: { text: "GitHub is connected.", tone: "info" },
  requested: {
    text: "GitHub sent the installation to an organisation owner for approval.",
    tone: "info",
  },
  forbidden: {
    text: "Only the owner can connect GitHub, after two-step verification.",
    tone: "error",
  },
  state: { text: "That GitHub link expired or didn't start here. Connect again.", tone: "error" },
  incomplete: {
    text: "GitHub didn't send the details needed. Turn on “Request user authorization (OAuth) during installation” in the app settings, then connect again.",
    tone: "error",
  },
  not_yours: {
    text: "That installation doesn't belong to your GitHub account, so it wasn't connected.",
    tone: "error",
  },
  not_configured: { text: "The GitHub App isn't configured on this server yet.", tone: "error" },
  github: { text: "GitHub isn't responding right now. Try again shortly.", tone: "error" },
};

const HEALTH_STYLES = {
  healthy: "border-nx-ok/60 text-nx-ok",
  degraded: "border-nx-warn/60 text-nx-warn",
  unknown: "border-nx-border text-nx-muted",
} as const;

const STATUS_STYLES: Record<string, string> = {
  processed: "text-nx-ok",
  pending: "text-nx-muted",
  processing: "text-nx-muted",
  failed: "text-nx-warn",
  dead: "text-nx-danger",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const viewer = await requireViewer();
  if (!can({ role: viewer.role, aal: "aal2" }, "integration:manage")) {
    return (
      <main id="main" className="p-6">
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p role="alert" className="mt-2 text-sm text-nx-danger">
          Only the workspace owner can manage integrations.
        </p>
      </main>
    );
  }

  const { notice, error } = await searchParams;
  const message = NOTICES[error ?? notice ?? ""];
  const app = getGitHubApp();
  const [integration, deliveries] = await Promise.all([
    getGitHubIntegration(),
    listRecentDeliveries(),
  ]);
  const dead = deliveries.filter((delivery) => delivery.status === "dead").length;
  const health = integration ? integrationHealth(integration, dead) : null;

  return (
    <main id="main" className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Integrations</h1>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-sm ${message.tone === "error" ? "text-nx-danger" : "text-nx-ok"}`}
        >
          {message.text}
        </p>
      )}

      <section
        aria-labelledby="github-heading"
        className="space-y-4 rounded-lg border border-nx-border bg-nx-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="github-heading" className="text-lg font-semibold">
            GitHub
          </h2>
          {health && (
            <span className={`rounded border px-2 py-0.5 text-xs ${HEALTH_STYLES[health.state]}`}>
              {health.state === "healthy"
                ? "Healthy"
                : health.state === "degraded"
                  ? "Degraded"
                  : "Not checked yet"}
            </span>
          )}
        </div>

        {!app.configured ? (
          <div className="space-y-2 text-sm">
            <p>The Nexus GitHub App isn&apos;t configured on this server.</p>
            <p className="text-nx-muted">
              Missing: <span className="font-mono text-xs">{app.missing.join(", ")}</span>. See{" "}
              <span className="font-mono text-xs">docs/runbooks/github-app.md</span>.
            </p>
          </div>
        ) : integration ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-nx-muted">Account</dt>
            <dd>
              {integration.account_login}{" "}
              <span className="text-nx-muted">({integration.account_type.toLowerCase()})</span>
            </dd>
            <dt className="text-nx-muted">Repositories</dt>
            <dd>
              {integration.repository_selection === "all"
                ? "All repositories"
                : "Selected repositories"}
            </dd>
            <dt className="text-nx-muted">Status</dt>
            <dd>{integration.status}</dd>
            <dt className="text-nx-muted">Health</dt>
            <dd>{health?.reason}</dd>
          </dl>
        ) : (
          <p className="text-sm text-nx-muted">
            Not connected. Connecting installs the Nexus GitHub App on the account and repositories
            you choose; Nexus never sees your GitHub password and stores no access tokens.
          </p>
        )}

        {app.configured && (
          <ActionForm
            action={startGitHubInstall}
            submitLabel={integration ? "Change repository access" : "Connect GitHub"}
            buttonClassName={integration ? buttonSecondary : undefined}
          />
        )}
      </section>

      {integration && (
        <section aria-labelledby="deliveries-heading" className="space-y-3">
          <h2 id="deliveries-heading" className="text-lg font-semibold">
            Recent webhook deliveries
          </h2>
          <p className="text-sm text-nx-muted">
            Failed deliveries are retried automatically with backoff. After five failures they stop
            here until you retry them.
          </p>
          {deliveries.length === 0 ? (
            <p className="text-sm text-nx-muted">No deliveries yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Recent GitHub webhook deliveries</caption>
              <thead className="text-xs text-nx-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Received (UTC)
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Event
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Attempts
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-nx-border align-top">
                    <td className="py-1.5 pr-3 text-xs text-nx-muted">
                      {dateFormat.format(new Date(delivery.received_at))}
                    </td>
                    <td className="py-1.5 pr-3">
                      {delivery.event}
                      {delivery.action ? (
                        <span className="text-nx-muted"> · {delivery.action}</span>
                      ) : null}
                    </td>
                    <td className={`py-1.5 pr-3 ${STATUS_STYLES[delivery.status] ?? ""}`}>
                      {delivery.status}
                      {delivery.last_error && (
                        <span
                          className="block max-w-xs truncate text-xs text-nx-muted"
                          title={delivery.last_error}
                        >
                          {delivery.last_error}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{delivery.attempts}</td>
                    <td className="py-1.5">
                      {(delivery.status === "dead" || delivery.status === "failed") && (
                        <ActionForm
                          action={retryDelivery}
                          submitLabel="Retry"
                          buttonClassName={buttonSecondary}
                          className="space-y-1"
                        >
                          <input type="hidden" name="deliveryRowId" value={delivery.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
