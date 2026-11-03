import { authorize } from "@nexus/auth";
import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import {
  MIN_PREPAID_DAYS,
  PLANNING_RATE,
  SAMPLE_KPIS,
  SAMPLE_PROVIDER_BALANCES,
  marginGuard,
} from "@/lib/owner/sample";

export const metadata: Metadata = { title: "Owner dashboard · Nexus Cloud" };

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const nairaCompact = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 2,
});
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fromKobo = (kobo: number) => kobo / 100;
const fromMicros = (micros: number) => micros / 1_000_000;
const percent = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`;

/** Sections of the Owner Dashboard (Hub plan, section 9), built in Hub Sprint 5. */
const SECTIONS = [
  ["Users", "Every customer, by country, state and type; suspend or refund"],
  ["Revenue and profit", "By day, workspace and model; top spenders; bundle sales"],
  ["Provider bills", "What we owe xAI and Groq, reconciled against their reports"],
  ["Pricing control", "Retail prices, exchange rate and bundles, with live margins"],
  ["Payments", "Paystack and Flutterwave transactions, settlements, VAT collected"],
  ["Safety", "Blocked prompts, reports, flagged content, fraud signals"],
  ["Growth", "Sign-up sources, first top-up conversion, retention, affiliates"],
  ["System health", "Provider latency, error rates, queue length, uptime"],
] as const;

export default async function OwnerDashboardPage() {
  const viewer = await requireViewer();
  const decision = authorize({ role: viewer.role, aal: viewer.aal }, "business:read");

  if (!decision.allowed) {
    return (
      <main id="main" className="p-6">
        <h1 className="text-xl font-semibold">Owner dashboard</h1>
        {decision.reason === "mfa_required" ? (
          <p role="alert" className="mt-2 text-sm text-nx-warn">
            Customer and revenue data need two-step verification in this session.{" "}
            <Link href="/mfa?next=/owner" className="underline">
              Verify it&apos;s you
            </Link>
          </p>
        ) : (
          <p role="alert" className="mt-2 text-sm text-nx-danger">
            Only the workspace owner can view the business dashboard.
          </p>
        )}
      </main>
    );
  }

  const k = SAMPLE_KPIS;
  const lowBalance = SAMPLE_PROVIDER_BALANCES.filter((p) => p.daysLeft < MIN_PREPAID_DAYS);
  const kpis = [
    ["New sign-ups", String(k.signUps), `${k.signUpsToppedUp} topped up already`],
    [
      "Top-ups received",
      nairaCompact.format(fromKobo(k.topUpsKobo)),
      `${k.topUpPayments} payments`,
    ],
    ["Usage charged", nairaCompact.format(fromKobo(k.usageKobo)), "VAT included"],
    [
      "Owed to providers",
      nairaCompact.format(fromKobo(k.owedToProvidersKobo)),
      `xAI ${dollars.format(fromMicros(k.owedUsdMicros.xai))} · Groq ${dollars.format(fromMicros(k.owedUsdMicros.groq))}`,
    ],
    [
      "Gross profit",
      nairaCompact.format(fromKobo(k.grossProfitKobo)),
      `${percent(k.marginBp)} margin after VAT and fees`,
    ],
    ["Failed jobs", percent(k.failedJobsBp), "all refunded · target under 3%"],
  ] as const;

  return (
    <main id="main" className="space-y-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Owner dashboard</h1>
          <p className="text-sm text-nx-muted">
            Nexus AI Hub · today · ₦{Number(PLANNING_RATE).toLocaleString("en-NG")} per $ planning
            rate
          </p>
        </div>
        <span className="rounded border border-nx-warn/60 px-2 py-0.5 text-xs text-nx-warn">
          Sample data until Hub Sprint 5
        </span>
      </div>

      {lowBalance.map((p) => (
        <p
          key={p.provider}
          role="status"
          className="rounded border border-nx-warn/60 bg-nx-panel px-4 py-2 text-sm"
        >
          {p.provider} prepaid balance covers about {p.daysLeft} days. Keep at least{" "}
          {MIN_PREPAID_DAYS} days funded so generation never stops.
        </p>
      ))}

      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title" className="sr-only">
          Today at a glance
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.map(([label, value, detail]) => (
            <li key={label} className="rounded-lg border border-nx-border bg-nx-surface p-4">
              <p className="text-xs text-nx-muted">{label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-nx-muted">{detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="margins-title"
          className="rounded-lg border border-nx-border bg-nx-surface p-4"
        >
          <h2 id="margins-title" className="font-semibold">
            Margin guard
          </h2>
          <p className="text-xs text-nx-muted">
            Live from the launch prices; flags any product under 40%.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-nx-muted">
              <tr>
                <th className="py-1 font-normal">Product</th>
                <th className="py-1 text-right font-normal">Price</th>
                <th className="py-1 text-right font-normal">Margin</th>
              </tr>
            </thead>
            <tbody>
              {marginGuard().map((row) => (
                <tr key={row.name} className="border-t border-nx-border">
                  <td className="py-1.5">
                    {row.name} <span className="text-xs text-nx-muted">· {row.workspace}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {naira.format(fromKobo(row.retailKobo))}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${row.belowMinimum ? "text-nx-danger" : "text-nx-ok"}`}
                  >
                    {Math.round(row.marginBp / 100)}%
                    {row.belowMinimum && <span className="sr-only"> (below 40%)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="space-y-6">
          <section
            aria-labelledby="providers-title"
            className="rounded-lg border border-nx-border bg-nx-surface p-4"
          >
            <h2 id="providers-title" className="font-semibold">
              Prepaid with providers
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {SAMPLE_PROVIDER_BALANCES.map((p) => (
                <li key={p.provider} className="flex justify-between">
                  <span>{p.provider}</span>
                  <span className="font-mono">
                    {dollars.format(fromMicros(p.usdMicros))} left · ~{p.daysLeft} days
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="agents-title"
            className="rounded-lg border border-nx-border bg-nx-surface p-4"
          >
            <h2 id="agents-title" className="font-semibold">
              Developer agent
            </h2>
            <p className="mt-1 text-sm text-nx-muted">
              Staff developers build with Nexus Cloud&apos;s agents. Public developers use the
              Hub&apos;s Developer Console.
            </p>
            <Link href="/projects" className="mt-3 inline-block text-sm text-nx-teal underline">
              Open the agent dashboard
            </Link>
          </section>
        </div>
      </div>

      <section aria-labelledby="sections-title">
        <h2 id="sections-title" className="font-semibold">
          Coming in Hub Sprint 5
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SECTIONS.map(([title, description]) => (
            <li key={title} className="rounded-lg border border-nx-border p-3">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-nx-muted">{description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
