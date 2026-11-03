import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Hidden, SelectField, TextArea, buttonSecondary } from "@/components/ui/fields";
import {
  formatMicros,
  formatUsd,
  getProjectModelSettings,
  projectSpentMicros,
} from "@/lib/models/queries";
import { listAvailableModels } from "@/lib/models/run";
import { askModel, liftProjectStop } from "./actions";

export const metadata: Metadata = { title: "Assistant · Nexus Cloud" };

const TASKS = [
  { value: "planning", label: "Planning" },
  { value: "routine", label: "Routine" },
  { value: "complex_code", label: "Complex code" },
  { value: "review", label: "Review" },
  { value: "research", label: "Research" },
] as const;

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [settings, spent] = await Promise.all([
    getProjectModelSettings(projectId),
    projectSpentMicros(projectId),
  ]);
  const limit = Number(settings?.monthly_budget_usd ?? 5);
  const models = listAvailableModels();

  return (
    <main id="main" className="max-w-xl space-y-8 p-6">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Assistant</h1>
        <p className="text-sm text-nx-muted">
          One prompt, through the model gateway. The budget is checked before anything is sent, and
          the cost is written to the usage ledger. To have an agent change the code, use the Agent
          panel on a task.
        </p>
        <p className="text-sm">
          Project spend this month: {formatMicros(spent)} of {formatUsd(limit)}
          {settings?.extended_until && new Date(settings.extended_until) > new Date()
            ? ` · stop lifted until ${settings.extended_until.slice(0, 16).replace("T", " ")} UTC`
            : ""}
        </p>
      </div>

      <ActionForm action={askModel} submitLabel="Ask">
        <Hidden name="projectId" value={projectId} />
        <SelectField
          name="taskKind"
          label="Task type"
          defaultValue="planning"
          options={[...TASKS]}
        />
        <SelectField
          name="model"
          label="AI model"
          hint="Automatic uses the default for the task type and falls back if a provider is down or declines. Pick any model to use it directly."
          defaultValue="auto"
          options={[{ value: "auto", label: "Automatic (by task type)" }, ...models]}
        />
        <TextArea name="prompt" label="Prompt" required maxLength={8000} rows={5} />
        <Checkbox
          name="allowExpensive"
          label="This request is large; spend anyway"
          hint="Required for a very long prompt, many images, or a long loop."
        />
      </ActionForm>

      <ActionForm
        action={liftProjectStop}
        submitLabel="Lift the project stop for 24 hours"
        buttonClassName={buttonSecondary}
      >
        <Hidden name="projectId" value={projectId} />
        <p className="text-sm text-nx-muted">
          Lets calls continue after the project budget is used up. Raising the number itself is on
          Settings. This needs the second factor.
        </p>
      </ActionForm>
    </main>
  );
}
