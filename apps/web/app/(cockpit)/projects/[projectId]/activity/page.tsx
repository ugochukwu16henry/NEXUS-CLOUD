import type { Metadata } from "next";
import { getActivity, getProject } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Activity · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const RESULT_STYLES = {
  success: "text-nx-ok",
  denied: "text-nx-warn",
  error: "text-nx-danger",
} as const;

/** Plain-language labels for the audit actions that appear on a project timeline. */
const ACTION_LABELS: Record<string, string> = {
  "project.create": "created the project",
  "project.update": "updated the project",
  "project.archive": "changed archive status",
  "requirement.create": "added a requirement",
  "requirement.update": "edited a requirement",
  "requirement.approval": "changed a requirement's approval",
  "milestone.create": "added a milestone",
  "milestone.update": "updated a milestone",
  "task.create": "created a task",
  "task.update": "edited a task",
  "task.move": "moved a task",
  "task.dependency_add": "added a dependency",
  "task.dependency_remove": "removed a dependency",
};

export default async function ActivityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [, events] = await Promise.all([getProject(projectId), getActivity(projectId)]);

  return (
    <main id="main" className="max-w-3xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Activity</h1>
      <p className="text-sm text-nx-muted">
        Every change to this project, newest first. Taken from the audit log.
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-nx-muted">No activity yet.</p>
      ) : (
        <ol className="space-y-2" aria-label="Project activity">
          {events.map((event) => {
            const metadata = (event.metadata ?? {}) as {
              to?: string;
              from?: string;
              ref?: number;
              reason?: string;
            };
            return (
              <li
                key={event.id}
                className="flex flex-wrap gap-x-3 border-b border-nx-border pb-2 text-sm"
              >
                <time dateTime={event.created_at} className="w-40 shrink-0 text-xs text-nx-muted">
                  {dateFormat.format(new Date(event.created_at))} UTC
                </time>
                <span>
                  <strong>{event.actor}</strong> {ACTION_LABELS[event.action] ?? event.action}
                  {metadata.from && metadata.to && (
                    <span className="text-nx-muted">
                      {" "}
                      ({metadata.from.replaceAll("_", " ")} → {metadata.to.replaceAll("_", " ")})
                    </span>
                  )}
                  {event.result !== "success" && (
                    <span
                      className={`ml-2 ${RESULT_STYLES[event.result as keyof typeof RESULT_STYLES]}`}
                    >
                      {event.result}
                      {metadata.reason ? `: ${metadata.reason.replaceAll("_", " ")}` : ""}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
