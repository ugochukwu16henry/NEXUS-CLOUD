import { BLOCKED_STATE, WORKFLOW_STATES, isDone, type WorkflowState } from "@nexus/core";
import type { Metadata } from "next";
import Link from "next/link";
import { BoardColumns, type BoardColumn } from "@/components/projects/board-columns";
import { buttonPrimary } from "@/components/ui/fields";
import { getProject, getProjectTasks } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Board · Nexus Cloud" };

const COLUMNS: WorkflowState[] = [BLOCKED_STATE, ...WORKFLOW_STATES];
const ALL_STATES = new Set<string>(COLUMNS);

/** Cards rendered per column before "Show all" (keeps large boards fast; test plan: 500 tasks < 1.5 s). */
const COLUMN_LIMIT = 50;

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { projectId } = await params;
  const shown = new Set(
    ((await searchParams).show ?? "").split(",").filter((state) => ALL_STATES.has(state)),
  );
  const [project, { tasks, edges }] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
  ]);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const base = `/projects/${project.id}/board`;

  const columns: BoardColumn[] = COLUMNS.map((state) => {
    const inColumn = tasks.filter((task) => task.state === state);
    const expanded = shown.has(state);
    const visible = expanded ? inColumn : inColumn.slice(0, COLUMN_LIMIT);
    return {
      state,
      total: inColumn.length,
      showAllHref:
        !expanded && inColumn.length > COLUMN_LIMIT
          ? `${base}?show=${[...shown, state].join(",")}`
          : null,
      cards: visible.map((task) => ({
        id: task.id,
        ref: task.ref,
        title: task.title,
        state: task.state,
        version: task.version,
        assignee: task.assignee,
        assigneeType: task.assignee_type,
        blockedReason: task.blocked_reason,
        waitingOn: edges
          .filter((edge) => edge.taskId === task.id)
          .map((edge) => byId.get(edge.dependsOnId))
          .filter((dep) => dep && !isDone(dep.state))
          .map((dep) => dep!.ref),
      })),
    };
  });

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
        <BoardColumns projectId={project.id} columns={columns} returnTo={base} />
      )}
    </main>
  );
}
