import { STATE_LABELS, WORKFLOW_STATES, isDone, type WorkflowState } from "@nexus/core";
import Link from "next/link";
import {
  getMilestones,
  getProject,
  getProjectTasks,
  getRequirements,
} from "@/lib/projects/queries";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Groups of workflow states shown on the dashboard. */
const GROUPS: { label: string; states: WorkflowState[] }[] = [
  { label: "Not started", states: ["backlog", "ready"] },
  { label: "In progress", states: ["in_progress", "agent_complete", "automated_checks"] },
  { label: "Waiting on you", states: ["needs_human_review", "client_review"] },
  { label: "Releasing", states: ["approved", "preview_ready", "release_approved", "deployed"] },
  { label: "Done", states: ["verified", "closed"] },
  { label: "Blocked", states: ["blocked"] },
];

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, { tasks }, requirements, milestones] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
    getRequirements(projectId),
    getMilestones(projectId),
  ]);

  const counts = Object.fromEntries(
    GROUPS.map((g) => [g.label, tasks.filter((t) => g.states.includes(t.state)).length]),
  );
  const allocated = tasks.reduce((sum, t) => sum + Number(t.budget_usd), 0);
  const budget = Number(project.budget_usd);
  const nextDecision =
    tasks.find((t) => t.state === "needs_human_review") ?? tasks.find((t) => t.state === "blocked");
  const approvedRequirements = requirements.filter((r) => r.approval === "approved").length;

  return (
    <main id="main" className="space-y-8 p-6">
      <h1 className="sr-only">Overview</h1>

      <section
        aria-labelledby="next-heading"
        className="rounded-lg border border-nx-border bg-nx-surface p-4"
      >
        <h2
          id="next-heading"
          className="text-xs font-semibold uppercase tracking-wider text-nx-muted"
        >
          Next decision
        </h2>
        {nextDecision ? (
          <p className="mt-2 text-sm">
            <Link
              href={`/projects/${project.id}/tasks/${nextDecision.id}`}
              className="text-nx-blue underline"
            >
              NX-{nextDecision.ref} {nextDecision.title}
            </Link>{" "}
            is <strong>{STATE_LABELS[nextDecision.state]}</strong>
            {nextDecision.blocked_reason ? `: ${nextDecision.blocked_reason}` : "."}
          </p>
        ) : (
          <p className="mt-2 text-sm text-nx-muted">Nothing is waiting on you.</p>
        )}
      </section>

      <section aria-labelledby="tasks-heading" className="space-y-3">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          Tasks
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {GROUPS.map((group) => (
            <div key={group.label} className="rounded-md border border-nx-border bg-nx-raised p-3">
              <dt className="text-xs text-nx-muted">{group.label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{counts[group.label]}</dd>
            </div>
          ))}
        </dl>
        <Link href={`/projects/${project.id}/board`} className="text-sm text-nx-blue underline">
          Open the board
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="budget-heading" className="space-y-2">
          <h2 id="budget-heading" className="text-lg font-semibold">
            Budget
          </h2>
          <p className="text-sm">
            {usd.format(allocated)} allocated to tasks of {usd.format(budget)}
          </p>
          {budget > 0 && (
            <div
              role="meter"
              aria-label="Budget allocated"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round((allocated / budget) * 100))}
              className="h-2 overflow-hidden rounded bg-nx-raised"
            >
              <div
                className={`h-full ${allocated > budget ? "bg-nx-danger" : "bg-nx-teal"}`}
                style={{ width: `${Math.min(100, (allocated / budget) * 100)}%` }}
              />
            </div>
          )}
          <p className="text-xs text-nx-muted">Actual model spend is tracked from Sprint 5.</p>
        </section>

        <section aria-labelledby="requirements-heading" className="space-y-2">
          <h2 id="requirements-heading" className="text-lg font-semibold">
            Requirements
          </h2>
          <p className="text-sm">
            {approvedRequirements} of {requirements.length} approved
          </p>
          <Link
            href={`/projects/${project.id}/requirements`}
            className="text-sm text-nx-blue underline"
          >
            Review requirements
          </Link>
        </section>

        <section aria-labelledby="milestones-heading" className="space-y-2">
          <h2 id="milestones-heading" className="text-lg font-semibold">
            Milestones
          </h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-nx-muted">None yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {milestones.map((milestone) => {
                const linked = tasks.filter((t) => t.milestone_id === milestone.id);
                const done = linked.filter((t) => isDone(t.state)).length;
                return (
                  <li key={milestone.id} className="flex justify-between gap-2">
                    <span>{milestone.title}</span>
                    <span className="text-nx-muted">
                      {done}/{linked.length} done
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-nx-muted">
        {tasks.length} tasks across {WORKFLOW_STATES.length} workflow states plus Blocked.
      </p>
    </main>
  );
}
