import { isDone } from "@nexus/core";
import type { Metadata } from "next";
import { createMilestone, updateMilestone } from "./actions";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Checkbox, Hidden, SelectField, TextArea, TextField } from "@/components/ui/fields";
import { getMilestones, getProject, getProjectTasks } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Milestones · Nexus Cloud" };

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];
const STATUS_TONE = { planned: "muted", in_progress: "teal", done: "ok" } as const;

function MilestoneFields({
  values = {},
  idPrefix,
}: {
  values?: {
    title?: string;
    criteria?: string;
    target_date?: string | null;
    status?: string;
    client_visible?: boolean;
  };
  idPrefix: string;
}) {
  return (
    <>
      <TextField
        id={`${idPrefix}-title`}
        name="title"
        label="Title"
        defaultValue={values.title}
        required
        maxLength={200}
      />
      <TextArea
        id={`${idPrefix}-criteria`}
        name="criteria"
        label="Done when"
        defaultValue={values.criteria}
        rows={2}
        maxLength={2000}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-date`}
          name="targetDate"
          label="Target date"
          type="date"
          defaultValue={values.target_date}
        />
        <SelectField
          id={`${idPrefix}-status`}
          name="status"
          label="Status"
          defaultValue={values.status ?? "planned"}
          options={STATUS_OPTIONS}
        />
      </div>
      <Checkbox
        id={`${idPrefix}-visible`}
        name="clientVisible"
        label="Show to the client (from Sprint 9)"
        defaultChecked={values.client_visible}
      />
    </>
  );
}

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, milestones, { tasks }] = await Promise.all([
    getProject(projectId),
    getMilestones(projectId),
    getProjectTasks(projectId),
  ]);

  return (
    <main id="main" className="max-w-3xl space-y-8 p-6">
      <h1 className="text-lg font-semibold">Milestones</h1>

      {milestones.length === 0 ? (
        <p className="text-sm text-nx-muted">No milestones yet.</p>
      ) : (
        <ul className="space-y-4">
          {milestones.map((milestone) => {
            const linked = tasks.filter((t) => t.milestone_id === milestone.id);
            const done = linked.filter((t) => isDone(t.state)).length;
            const percent = linked.length ? Math.round((done / linked.length) * 100) : 0;
            return (
              <li
                key={milestone.id}
                className="space-y-3 rounded-lg border border-nx-border bg-nx-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{milestone.title}</h2>
                  <Badge tone={STATUS_TONE[milestone.status]}>
                    {STATUS_OPTIONS.find((o) => o.value === milestone.status)?.label}
                  </Badge>
                </div>
                <p className="text-sm text-nx-muted">
                  {done} of {linked.length} linked tasks done
                  {milestone.target_date ? ` · target ${milestone.target_date}` : ""}
                </p>
                <div
                  role="progressbar"
                  aria-label={`${milestone.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-2 overflow-hidden rounded bg-nx-raised"
                >
                  <div className="h-full bg-nx-teal" style={{ width: `${percent}%` }} />
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-nx-blue">Edit milestone</summary>
                  <div className="mt-3">
                    <ActionForm
                      action={updateMilestone}
                      submitLabel="Save milestone"
                      version={milestone.version}
                    >
                      <Hidden name="projectId" value={project.id} />
                      <Hidden name="milestoneId" value={milestone.id} />
                      <MilestoneFields values={milestone} idPrefix={milestone.id} />
                    </ActionForm>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <section
        aria-labelledby="new-milestone-heading"
        className="space-y-4 rounded-lg border border-nx-border bg-nx-surface p-5"
      >
        <h2 id="new-milestone-heading" className="text-base font-semibold">
          New milestone
        </h2>
        <ActionForm action={createMilestone} submitLabel="Add milestone" resetOnSuccess>
          <Hidden name="projectId" value={project.id} />
          <MilestoneFields idPrefix="new" />
        </ActionForm>
      </section>
    </main>
  );
}
