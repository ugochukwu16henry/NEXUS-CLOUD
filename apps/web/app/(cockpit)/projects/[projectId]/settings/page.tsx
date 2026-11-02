import type { Metadata } from "next";
import { setProjectArchived, updateProject } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Hidden, SelectField, TextField, buttonSecondary } from "@/components/ui/fields";
import { getProject } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Project settings · Nexus Cloud" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <main id="main" className="max-w-xl space-y-10 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <ActionForm action={updateProject} submitLabel="Save project" version={project.version}>
        <Hidden name="projectId" value={project.id} />
        <TextField name="name" label="Name" defaultValue={project.name} required maxLength={120} />
        <TextField
          name="clientName"
          label="Client"
          defaultValue={project.client_name}
          maxLength={120}
        />
        <TextField name="stack" label="Stack" defaultValue={project.stack} maxLength={200} />
        <TextField
          name="environments"
          label="Environments"
          defaultValue={project.environments.join(", ")}
          hint="Comma-separated, lower-case."
        />
        <TextField
          name="budgetUsd"
          label="Budget (USD)"
          type="number"
          defaultValue={project.budget_usd}
        />
        <SelectField
          name="status"
          label="Status"
          defaultValue={project.status}
          options={[
            { value: "active", label: "Active" },
            { value: "on_hold", label: "On hold" },
            { value: "completed", label: "Completed" },
          ]}
        />
      </ActionForm>

      <section aria-labelledby="archive-heading" className="space-y-2">
        <h2 id="archive-heading" className="text-base font-semibold">
          {project.archived_at ? "Restore project" : "Archive project"}
        </h2>
        <p className="text-sm text-nx-muted">
          Projects are never deleted. Archiving hides a project from active work and keeps its full
          history.
        </p>
        <ActionForm
          action={setProjectArchived}
          submitLabel={project.archived_at ? "Restore project" : "Archive project"}
          version={project.version}
          buttonClassName={buttonSecondary}
        >
          <Hidden name="projectId" value={project.id} />
          <Hidden name="archive" value={project.archived_at ? "false" : "true"} />
        </ActionForm>
      </section>
    </main>
  );
}
