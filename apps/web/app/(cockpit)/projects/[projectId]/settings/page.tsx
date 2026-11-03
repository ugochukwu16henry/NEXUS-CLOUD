import type { Metadata } from "next";
import { setProjectArchived, updateProject } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Hidden, SelectField, TextField, buttonSecondary } from "@/components/ui/fields";
import { getProject } from "@/lib/projects/queries";
import { getWorkspaceLimits } from "@/lib/workspace/server";
import { updateWorkspaceSettings } from "./actions";

export const metadata: Metadata = { title: "Project settings · Nexus Cloud" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, limits] = await Promise.all([
    getProject(projectId),
    getWorkspaceLimits(projectId),
  ]);

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
      <section aria-labelledby="workspace-heading" className="space-y-3">
        <h2 id="workspace-heading" className="text-base font-semibold">
          Workspace
        </h2>
        <p className="text-sm text-nx-muted">
          Limits for uploading files and folders into the code, and for attachments on tasks.
          Sandbox, terminal and agent settings arrive with Sprint 6.
        </p>
        <ActionForm action={updateWorkspaceSettings} submitLabel="Save workspace settings">
          <Hidden name="projectId" value={project.id} />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              name="maxFileMb"
              label="Largest file (MB)"
              type="number"
              defaultValue={limits.maxFileMb}
              required
            />
            <TextField
              name="maxUploadMb"
              label="Largest upload (MB)"
              type="number"
              defaultValue={limits.maxUploadMb}
              required
            />
            <TextField
              name="maxFiles"
              label="Files per upload"
              type="number"
              defaultValue={limits.maxFiles}
              required
            />
            <TextField
              name="attachmentMaxMb"
              label="Largest attachment (MB)"
              type="number"
              defaultValue={limits.attachmentMaxMb}
              required
            />
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">Attachments allowed</legend>
            {(
              [
                ["kindImage", "image", "Pictures (PNG, JPEG, GIF, WebP, SVG)"],
                ["kindPdf", "pdf", "PDFs"],
                ["kindText", "text", "Text, Markdown, CSV, JSON"],
                ["kindOther", "other", "Anything else (downloads only)"],
              ] as const
            ).map(([name, kind, label]) => (
              <label key={name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={limits.attachmentKinds.includes(kind)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <TextField
            name="skipFolders"
            label="Folders to skip when uploading"
            hint="Comma-separated, matched at any depth. They are listed as skipped, never uploaded."
            defaultValue={limits.skipFolders.join(", ")}
            maxLength={1000}
          />
        </ActionForm>
      </section>
    </main>
  );
}
