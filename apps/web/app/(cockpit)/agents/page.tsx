import type { Metadata } from "next";
import Link from "next/link";
import { listRecentRuns } from "@/lib/agents/queries";
import { formatMicros } from "@/lib/models/queries";

export const metadata: Metadata = { title: "Agents · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const STATUS_STYLE: Record<string, string> = {
  queued: "text-nx-muted",
  running: "text-nx-teal",
  waiting_approval: "text-nx-warn",
  succeeded: "text-nx-ok",
  failed: "text-nx-danger",
  cancelled: "text-nx-muted",
};

/**
 * Every agent run across the owner's projects (Sprint 6): what each one is doing, what it cost,
 * and which ones wait for the owner. Runs start from a task's Agent panel; this page links back.
 */
export default async function AgentsPage() {
  const { runs, waiting } = await listRecentRuns();
  const byRun = new Map(runs.map((run) => [run.id, run]));
  const taskHref = (run: { project_id: string; task_id: string }) =>
    `/projects/${run.project_id}/tasks/${run.task_id}`;

  return (
    <main id="main" className="max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-nx-muted">
          Planner and coder runs across your projects. Start one from a task&apos;s Agent panel: the
          planner proposes, you approve, and the coder works on the task&apos;s files in a sandbox.
        </p>
      </div>

      <section aria-labelledby="waiting-heading" className="space-y-2">
        <h2 id="waiting-heading" className="text-lg font-semibold">
          Waiting for you
        </h2>
        {waiting.length === 0 &&
        !runs.some((run) => run.status === "waiting_approval" && run.kind === "planner") ? (
          <p className="text-sm text-nx-muted">Nothing is waiting for approval.</p>
        ) : (
          <ul className="space-y-2" aria-label="Waiting for approval">
            {runs
              .filter((run) => run.status === "waiting_approval" && run.kind === "planner")
              .map((run) => (
                <li key={run.id} className="rounded border border-nx-warn/60 p-3 text-sm">
                  <Link href={taskHref(run)} className="text-nx-blue underline">
                    A plan for NX-{run.tasks?.ref} {run.tasks?.title}
                  </Link>{" "}
                  <span className="text-nx-muted">({run.projectName})</span>
                </li>
              ))}
            {waiting.map((item) => {
              const run = byRun.get(item.run_id);
              return (
                <li key={item.id} className="rounded border border-nx-warn/60 p-3 text-sm">
                  Command <span className="font-mono">{item.command}</span>
                  {run && (
                    <>
                      {" "}
                      on{" "}
                      <Link href={taskHref(run)} className="text-nx-blue underline">
                        NX-{run.tasks?.ref} {run.tasks?.title}
                      </Link>{" "}
                      <span className="text-nx-muted">({run.projectName})</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="runs-heading" className="space-y-2">
        <h2 id="runs-heading" className="text-lg font-semibold">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-nx-muted">
            No runs yet. Open a task, describe the work under Agent, and choose Plan.
          </p>
        ) : (
          <ul className="divide-y divide-nx-border" aria-label="Agent runs">
            {runs.map((run) => (
              <li key={run.id} className="space-y-0.5 py-2 text-sm">
                <p>
                  <Link href={taskHref(run)} className="text-nx-blue underline">
                    NX-{run.tasks?.ref} {run.tasks?.title}
                  </Link>{" "}
                  <span className="text-nx-muted">· {run.projectName}</span>
                </p>
                <p className="text-xs">
                  <span className="text-nx-muted">{run.kind}</span> ·{" "}
                  <span className={STATUS_STYLE[run.status] ?? ""}>
                    {run.status.replaceAll("_", " ")}
                  </span>{" "}
                  · {formatMicros(run.spent_usd_micros)} of {formatMicros(run.budget_usd_micros)} ·
                  step {run.iteration} of {run.max_iterations} ·{" "}
                  {dateFormat.format(new Date(run.created_at))} UTC
                </p>
                {run.error && <p className="text-xs text-nx-danger">{run.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
