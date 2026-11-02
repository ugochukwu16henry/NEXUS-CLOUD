import { STATE_LABELS, type WorkflowState } from "@nexus/core";

export type BoardTask = { id: string; title: string; state: WorkflowState; owner: string };

const STATE_STYLES: Partial<Record<WorkflowState, string>> = {
  blocked: "border-nx-danger/60 text-nx-danger",
  needs_human_review: "border-nx-warn/60 text-nx-warn",
  verified: "border-nx-ok/60 text-nx-ok",
  approved: "border-nx-teal/60 text-nx-teal",
};

export function WorkflowBoard({ tasks }: { tasks: BoardTask[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Workflow board">
      {tasks.map((task) => (
        <li key={task.id} className="rounded-md border border-nx-border bg-nx-raised p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-nx-muted">{task.id}</span>
            <span
              className={`rounded border px-1.5 py-0.5 ${STATE_STYLES[task.state] ?? "border-nx-border text-nx-muted"}`}
            >
              {STATE_LABELS[task.state]}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium">{task.title}</p>
          <p className="mt-1 text-xs text-nx-muted">{task.owner}</p>
        </li>
      ))}
    </ul>
  );
}
