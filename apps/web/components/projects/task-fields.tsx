import { SelectField, TextArea, TextField } from "@/components/ui/fields";

type Option = { id: string; label: string };

export type TaskFieldValues = {
  title?: string;
  description?: string;
  assignee?: string | null;
  assignee_type?: string;
  budget_usd?: number;
  due_date?: string | null;
  acceptance_criteria?: string;
  evidence_links?: string[];
  requirement_id?: string | null;
  milestone_id?: string | null;
};

/** The editable task fields, shared by the new-task and task-detail forms. */
export function TaskFields({
  values = {},
  requirements,
  milestones,
}: {
  values?: TaskFieldValues;
  requirements: Option[];
  milestones: Option[];
}) {
  return (
    <>
      <TextField name="title" label="Title" defaultValue={values.title} required maxLength={200} />
      <TextArea
        name="description"
        label="Description"
        defaultValue={values.description}
        rows={4}
        maxLength={10000}
      />
      <TextArea
        name="acceptanceCriteria"
        label="Acceptance criteria"
        defaultValue={values.acceptance_criteria}
        hint="How we'll know it's done, ideally as Given / When / Then."
        maxLength={5000}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="assignee"
          label="Assignee"
          defaultValue={values.assignee}
          maxLength={120}
        />
        <SelectField
          name="assigneeType"
          label="Assignee type"
          defaultValue={values.assignee_type ?? "human"}
          options={[
            { value: "human", label: "Person" },
            { value: "agent", label: "AI agent" },
          ]}
        />
        <TextField
          name="budgetUsd"
          label="Budget (USD)"
          type="number"
          defaultValue={values.budget_usd}
        />
        <TextField name="dueDate" label="Due date" type="date" defaultValue={values.due_date} />
        <SelectField
          name="requirementId"
          label="Requirement"
          defaultValue={values.requirement_id}
          options={[
            { value: "", label: "None" },
            ...requirements.map((r) => ({ value: r.id, label: r.label })),
          ]}
        />
        <SelectField
          name="milestoneId"
          label="Milestone"
          defaultValue={values.milestone_id}
          options={[
            { value: "", label: "None" },
            ...milestones.map((m) => ({ value: m.id, label: m.label })),
          ]}
        />
      </div>
      <TextArea
        name="evidenceLinks"
        label="Evidence links"
        defaultValue={values.evidence_links?.join("\n")}
        hint="One https:// link per line: PRs, test reports, previews."
        rows={3}
      />
    </>
  );
}
