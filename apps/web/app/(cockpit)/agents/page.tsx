import type { Metadata } from "next";
import Link from "next/link";
import { getLatestMessages } from "@/lib/agents/chat";
import { listRecentRuns } from "@/lib/agents/queries";
import { listProjects } from "@/lib/projects/queries";
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
 * The way into each project's Agent chat (newest conversation first), then everything waiting for
 * the owner, then every run across projects.
 */
export default async function AgentsPage() {
  const [{ runs, waiting }, latest, projects] = await Promise.all([
    listRecentRuns(),
    getLatestMessages(),
    listProjects(),
  ]);
  const open = projects
    .filter((project) => !project.archived_at)
    .sort(
      (a, b) =>
        Date.parse(latest.get(b.id)?.created_at ?? b.updated_at) -
        Date.parse(latest.get(a.id)?.created_at ?? a.updated_at),
    );
  const byRun = new Map(runs.map((run) => [run.id, run]));
  const taskHref = (run: { project_id: string; task_id: string }) =>
    `/projects/${run.project_id}/tasks/${run.task_id}`;

  return (
    <main id="main" className="max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-nx-muted">
          Each project has its own conversation with the agent, kept for good. Open one to carry on
          where you left off.
        </p>
      </div>

      <section aria-labelledby="chats-heading" className="space-y-2">
        <h2 id="chats-heading" className="text-lg font-semibold">
          Conversations
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-nx-muted">
            No projects yet.{" "}
            <Link href="/projects" className="text-nx-blue underline">
              Create one
            </Link>{" "}
            to start talking to the agent.
          </p>
        ) : (
          <ul
            className="divide-y divide-nx-border rounded-lg border border-nx-border"
            aria-label="Project conversations"
          >
            {open.map((project) => {
              const last = latest.get(project.id);
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}/agent`}
                    className="block space-y-0.5 px-4 py-3 hover:bg-nx-raised"
                  >
                    <span className="block font-medium text-nx-blue underline">{project.name}</span>
                    <span className="block truncate text-sm text-nx-muted">
                      {last
                        ? `${last.author === "owner" ? "You" : "Agent"}: ${last.content}`
                        : "No messages yet. Start the conversation."}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
