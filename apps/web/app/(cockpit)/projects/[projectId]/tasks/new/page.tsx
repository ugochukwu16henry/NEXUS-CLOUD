import type { Metadata } from "next";
import { createTask } from "../actions";
import { TaskFields } from "@/components/projects/task-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Hidden, SelectField } from "@/components/ui/fields";
import {
  getMilestones,
  getProject,
  getProjectTasks,
  getRequirements,
} from "@/lib/projects/queries";

export const metadata: Metadata = { title: "New task · Nexus Cloud" };

export default async function NewTaskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, { tasks }, requirements, milestones] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
    getRequirements(projectId),
    getMilestones(projectId),
  ]);

  return (
    <main id="main" className="max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">New task</h1>
      <ActionForm action={createTask} submitLabel="Create task">
        <Hidden name="projectId" value={project.id} />
        <TaskFields
          requirements={requirements.map((r) => ({ id: r.id, label: `REQ-${r.ref} ${r.title}` }))}
          milestones={milestones.map((m) => ({ id: m.id, label: m.title }))}
        />
        <SelectField
          name="state"
          label="Start in"
          defaultValue="backlog"
          options={[
            { value: "backlog", label: "Backlog" },
            { value: "ready", label: "Ready" },
          ]}
        />
        {tasks.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Depends on</legend>
            <p className="text-xs text-nx-muted">
              Work can't start until these are Verified or Closed.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-nx-border p-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2">
                  <input
                    id={`dep-${task.id}`}
                    type="checkbox"
                    name="dependsOn"
                    value={task.id}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`dep-${task.id}`} className="text-sm">
                    NX-{task.ref} {task.title}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </ActionForm>
    </main>
  );
}
