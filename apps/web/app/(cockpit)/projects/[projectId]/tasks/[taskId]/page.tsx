import { STATE_LABELS, isDone, type WorkflowState } from "@nexus/core";
import type { Metadata } from "next";
import Link from "next/link";
import { addDependency, removeDependency, updateTask } from "../actions";
import { MoveTaskForm } from "@/components/projects/move-task-form";
import { TaskFields } from "@/components/projects/task-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Hidden, SelectField, buttonSecondary } from "@/components/ui/fields";
import { getTaskLinks } from "@/lib/github/repository";
import { getMilestones, getProjectTasks, getRequirements, getTask } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Task · Nexus Cloud" };

export default async function TaskPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const [task, { tasks, edges }, requirements, milestones, links] = await Promise.all([
    getTask(projectId, taskId),
    getProjectTasks(projectId),
    getRequirements(projectId),
    getMilestones(projectId),
    getTaskLinks(taskId),
  ]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependsOn = edges
    .filter((e) => e.taskId === task.id)
    .map((e) => byId.get(e.dependsOnId)!)
    .filter(Boolean);
  const dependedOnBy = edges
    .filter((e) => e.dependsOnId === task.id)
    .map((e) => byId.get(e.taskId)!)
    .filter(Boolean);
  const candidates = tasks.filter((t) => t.id !== task.id && !dependsOn.some((d) => d.id === t.id));
  const state = task.state as WorkflowState;
  const here = `/projects/${projectId}/tasks/${task.id}`;

  return (
    <main id="main" className="grid gap-8 p-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs text-nx-muted">NX-{task.ref}</p>
          <h1 className="text-lg font-semibold">{task.title}</h1>
        </div>
        <ActionForm action={updateTask} submitLabel="Save task" version={task.version}>
          <Hidden name="projectId" value={projectId} />
          <Hidden name="taskId" value={task.id} />
          <TaskFields
            values={task}
            requirements={requirements.map((r) => ({ id: r.id, label: `REQ-${r.ref} ${r.title}` }))}
            milestones={milestones.map((m) => ({ id: m.id, label: m.title }))}
          />
        </ActionForm>
      </div>

      <aside className="space-y-8" aria-label="Task status and dependencies">
        <section aria-labelledby="state-heading" className="space-y-2">
          <h2 id="state-heading" className="text-base font-semibold">
            State
          </h2>
          <p>
            <Badge tone={state === "blocked" ? "danger" : isDone(state) ? "ok" : "teal"}>
              {STATE_LABELS[state]}
            </Badge>
          </p>
          {task.blocked_reason && <p className="text-sm text-nx-danger">{task.blocked_reason}</p>}
          <MoveTaskForm
            projectId={projectId}
            taskId={task.id}
            taskRef={task.ref}
            state={state}
            version={task.version}
            returnTo={here}
          />
          <p className="text-xs text-nx-muted">
            Moving to Approved or Release Approved needs your authenticator code.
          </p>
        </section>

        <section aria-labelledby="deps-heading" className="space-y-2">
          <h2 id="deps-heading" className="text-base font-semibold">
            Depends on
          </h2>
          {dependsOn.length === 0 ? (
            <p className="text-sm text-nx-muted">Nothing.</p>
          ) : (
            <ul className="space-y-2">
              {dependsOn.map((dep) => (
                <li key={dep.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/projects/${projectId}/tasks/${dep.id}`} className="hover:underline">
                    NX-{dep.ref} {dep.title}{" "}
                    <span className="text-xs text-nx-muted">({STATE_LABELS[dep.state]})</span>
                  </Link>
                  <ActionForm
                    action={removeDependency}
                    submitLabel="Remove"
                    className="shrink-0"
                    buttonClassName="text-xs text-nx-muted underline"
                    announceSuccess
                  >
                    <Hidden name="projectId" value={projectId} />
                    <Hidden name="taskId" value={task.id} />
                    <Hidden name="dependsOnId" value={dep.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > 0 && (
            <ActionForm
              action={addDependency}
              submitLabel="Add dependency"
              buttonClassName={buttonSecondary}
            >
              <Hidden name="projectId" value={projectId} />
              <Hidden name="taskId" value={task.id} />
              <SelectField
                name="dependsOnId"
                label="Add a task this depends on"
                options={candidates.map((t) => ({ value: t.id, label: `NX-${t.ref} ${t.title}` }))}
              />
            </ActionForm>
          )}
        </section>

        {dependedOnBy.length > 0 && (
          <section aria-labelledby="blocking-heading" className="space-y-2">
            <h2 id="blocking-heading" className="text-base font-semibold">
              Needed by
            </h2>
            <ul className="space-y-1 text-sm">
              {dependedOnBy.map((t) => (
                <li key={t.id}>
                  <Link href={`/projects/${projectId}/tasks/${t.id}`} className="hover:underline">
                    NX-{t.ref} {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="github-heading" className="space-y-2">
          <h2 id="github-heading" className="text-base font-semibold">
            On GitHub
          </h2>
          {links.length === 0 ? (
            <p className="text-sm text-nx-muted">
              Nothing linked. Use <span className="font-mono">NX-{task.ref}</span> in a branch name,
              commit message or pull request title.
            </p>
          ) : (
            <ul className="space-y-1 text-sm" aria-label="Linked GitHub work">
              {links.map((link) => (
                <li key={`${link.kind}-${link.ref}`}>
                  <span className="text-nx-muted">
                    {link.kind === "branch"
                      ? "Branch"
                      : link.kind === "commit"
                        ? "Commit"
                        : "Pull request"}
                  </span>{" "}
                  {link.url ? (
                    <a
                      href={link.url}
                      rel="noreferrer noopener"
                      target="_blank"
                      className="text-nx-blue underline"
                    >
                      {link.kind === "commit"
                        ? link.ref.slice(0, 7)
                        : link.kind === "pull_request"
                          ? `#${link.ref}`
                          : link.ref}
                    </a>
                  ) : (
                    <span className="font-mono">{link.ref}</span>
                  )}
                  {link.title && link.kind !== "branch" && (
                    <span className="block text-xs text-nx-muted">{link.title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {task.evidence_links.length > 0 && (
          <section aria-labelledby="evidence-heading" className="space-y-2">
            <h2 id="evidence-heading" className="text-base font-semibold">
              Evidence
            </h2>
            <ul className="space-y-1 text-sm">
              {task.evidence_links.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="break-all text-nx-blue underline"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </main>
  );
}
