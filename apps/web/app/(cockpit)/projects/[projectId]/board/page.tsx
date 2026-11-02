import {
  BLOCKED_STATE,
  STATE_LABELS,
  WORKFLOW_STATES,
  isDone,
  type WorkflowState,
} from "@nexus/core";
import type { Metadata } from "next";
import Link from "next/link";
import { MoveTaskForm } from "@/components/projects/move-task-form";
import { buttonPrimary } from "@/components/ui/fields";
import { getProject, getProjectTasks } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Board · Nexus Cloud" };

const COLUMNS: WorkflowState[] = [BLOCKED_STATE, ...WORKFLOW_STATES];

export default async function BoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, { tasks, edges }] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
  ]);
  const stateById = new Map(tasks.map((task) => [task.id, task.state]));
  const refById = new Map(tasks.map((task) => [task.id, task.ref]));
  const returnTo = `/projects/${project.id}/board`;

  return (
    <main id="main" className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Board</h1>
        <Link href={`/projects/${project.id}/tasks/new`} className={buttonPrimary}>
          New task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-nx-muted">No tasks yet.</p>
      ) : (
        <div
          role="region"
          aria-label="Workflow board, scrolls sideways"
          tabIndex={0}
          className="overflow-x-auto pb-2"
        >
          <ol className="flex gap-3" aria-label="Workflow columns">
            {COLUMNS.map((column) => {
              const columnTasks = tasks.filter((task) => task.state === column);
              if (column === BLOCKED_STATE && columnTasks.length === 0) return null;
              return (
                <li key={column} className="w-64 shrink-0">
                  <h2 className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-nx-muted">
                    <span>{STATE_LABELS[column]}</span>
                    <span>{columnTasks.length}</span>
                  </h2>
                  <ul className="space-y-2" aria-label={`${STATE_LABELS[column]} tasks`}>
                    {columnTasks.map((task) => {
                      const waitingOn = edges
                        .filter((edge) => edge.taskId === task.id)
                        .filter((edge) => !isDone(stateById.get(edge.dependsOnId) ?? "backlog"));
                      return (
                        <li
                          key={task.id}
                          className={`space-y-2 rounded-md border bg-nx-raised p-3 ${
                            task.state === BLOCKED_STATE
                              ? "border-nx-danger/60"
                              : "border-nx-border"
                          }`}
                        >
                          <div>
                            <span className="font-mono text-xs text-nx-muted">NX-{task.ref}</span>
                            <Link
                              href={`/projects/${project.id}/tasks/${task.id}`}
                              className="block text-sm font-medium hover:underline"
                            >
                              {task.title}
                            </Link>
                          </div>
                          {task.assignee && (
                            <p className="text-xs text-nx-muted">
                              {task.assignee_type === "agent" ? "Agent: " : ""}
                              {task.assignee}
                            </p>
                          )}
                          {task.blocked_reason && (
                            <p className="text-xs text-nx-danger">{task.blocked_reason}</p>
                          )}
                          {waitingOn.length > 0 && (
                            <p className="text-xs text-nx-warn">
                              Waiting on{" "}
                              {waitingOn
                                .map((edge) => `NX-${refById.get(edge.dependsOnId)}`)
                                .join(", ")}
                            </p>
                          )}
                          <MoveTaskForm
                            projectId={project.id}
                            taskId={task.id}
                            taskRef={task.ref}
                            state={task.state}
                            version={task.version}
                            returnTo={returnTo}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </main>
  );
}
