import { SelectField, TextArea, TextField } from "@/components/ui/fields";

export const PRIORITY_OPTIONS = [
  { value: "must", label: "Must" },
  { value: "should", label: "Should" },
  { value: "could", label: "Could" },
  { value: "wont", label: "Won't (this release)" },
];

export function RequirementFields({
  values = {},
  idPrefix = "",
}: {
  values?: {
    title?: string;
    statement?: string;
    acceptance_criteria?: string;
    priority?: string;
    source?: string | null;
  };
  idPrefix?: string;
}) {
  return (
    <>
      <TextField
        id={`${idPrefix}title`}
        name="title"
        label="Title"
        defaultValue={values.title}
        required
        maxLength={200}
      />
      <TextArea
        id={`${idPrefix}statement`}
        name="statement"
        label="Statement"
        defaultValue={values.statement}
        required
        rows={3}
        maxLength={5000}
      />
      <TextArea
        id={`${idPrefix}acceptanceCriteria`}
        name="acceptanceCriteria"
        label="Acceptance criteria"
        defaultValue={values.acceptance_criteria}
        hint="Measurable and testable, e.g. Given / When / Then."
        rows={3}
        maxLength={5000}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${idPrefix}priority`}
          name="priority"
          label="Priority"
          defaultValue={values.priority ?? "should"}
          options={PRIORITY_OPTIONS}
        />
        <TextField
          id={`${idPrefix}source`}
          name="source"
          label="Source"
          defaultValue={values.source}
          maxLength={200}
          hint="Who asked, or where it came from."
        />
      </div>
    </>
  );
}
