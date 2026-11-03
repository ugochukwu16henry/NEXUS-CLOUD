import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, buttonSecondary } from "@/components/ui/fields";
import { formatMicros, getModelRoutes, getSpendCap, listRecentUsage } from "@/lib/models/queries";
import { liftGlobalStop, updateGlobalCap, updateRoutes } from "./actions";

export const metadata: Metadata = { title: "Models · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "xai", label: "xAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
];

const KINDS = [
  ["planning", "Planning"],
  ["routine", "Routine"],
  ["complex_code", "Complex code"],
  ["review", "Review"],
  ["research", "Research"],
] as const;

export default async function ModelsPage() {
  const [cap, routes, usage] = await Promise.all([
    getSpendCap(),
    getModelRoutes(),
    listRecentUsage(),
  ]);
  const byKind = new Map(routes.map((route) => [route.task_kind, route]));
  const lifted = cap?.extended_until && new Date(cap.extended_until) > new Date();

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-10 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Models</h1>
        <p className="text-sm text-nx-muted">
          Keys stay on the server. Anthropic and OpenAI are the live adapters. Gemini, xAI,
          DeepSeek, Groq and OpenRouter use the same request shape and wait for an account. The
          routes below are provisional: the live benchmark has not been run, because no provider
          account is funded.
        </p>
        <Link href="/settings" className="text-sm text-nx-blue underline">
          Back to settings
        </Link>
      </div>

      <section aria-labelledby="cap-heading" className="space-y-3">
        <h2 id="cap-heading" className="text-lg font-semibold">
          Monthly cap
        </h2>
        <p className="text-sm text-nx-muted">
          Warnings at 50%, 75% and 90%. Calls stop at 100% until you lift the stop or raise the cap.
          {lifted
            ? ` Stop lifted until ${cap?.extended_until?.slice(0, 16).replace("T", " ")} UTC.`
            : ""}
        </p>
        {cap && (
          <ActionForm action={updateGlobalCap} submitLabel="Save cap" version={cap.version}>
            <TextField
              name="monthlyUsd"
              label="Global cap (USD / month)"
              type="number"
              defaultValue={cap.monthly_usd}
              required
            />
          </ActionForm>
        )}
        <ActionForm
          action={liftGlobalStop}
          submitLabel="Lift the monthly stop for 24 hours"
          buttonClassName={buttonSecondary}
        />
      </section>

      <section aria-labelledby="routes-heading" className="space-y-3">
        <h2 id="routes-heading" className="text-lg font-semibold">
          Default model per task
        </h2>
        <ActionForm action={updateRoutes} submitLabel="Save routes">
          {KINDS.map(([kind, label]) => {
            const route = byKind.get(kind);
            return (
              <div key={kind} className="grid grid-cols-2 gap-3">
                <SelectField
                  name={`${kind}Provider`}
                  label={`${label} provider`}
                  defaultValue={route?.provider ?? "anthropic"}
                  options={PROVIDERS}
                />
                <TextField
                  name={`${kind}Model`}
                  label={`${label} model`}
                  defaultValue={route?.model ?? ""}
                  required
                  maxLength={120}
                />
              </div>
            );
          })}
        </ActionForm>
      </section>

      <section aria-labelledby="ledger-heading" className="space-y-3">
        <h2 id="ledger-heading" className="text-lg font-semibold">
          Usage ledger
        </h2>
        {usage.length === 0 ? (
          <p className="text-sm text-nx-muted">No model calls yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Recent model calls</caption>
            <thead className="text-xs text-nx-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  When (UTC)
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Project
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Model
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Cost
                </th>
                <th scope="col" className="py-1 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.map(({ row, projectName }) => (
                <tr key={row.id} className="border-t border-nx-border">
                  <td className="py-2 pr-3">{dateFormat.format(new Date(row.created_at))}</td>
                  <td className="py-2 pr-3">{projectName}</td>
                  <td className="py-2 pr-3">
                    {row.provider}/{row.model}
                    {row.fallback_from_model
                      ? ` (from ${row.fallback_from_provider}/${row.fallback_from_model})`
                      : ""}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {formatMicros(row.cost_usd_micros)}
                  </td>
                  <td className="py-2">{row.ok ? "ok" : "failed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
