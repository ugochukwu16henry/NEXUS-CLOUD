import type { Metadata } from "next";
import { setProjectArchived, updateProject } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Hidden, SelectField, TextField, buttonSecondary } from "@/components/ui/fields";
import { getProject } from "@/lib/projects/queries";
import { getWorkspaceLimits } from "@/lib/workspace/server";
import {
  formatMicros,
  formatUsd,
  getProjectModelSettings,
  projectSpentMicros,
} from "@/lib/models/queries";
import { updateWorkspaceSettings } from "./actions";
import { updateProjectModelSettings } from "./model-actions";

export const metadata: Metadata = { title: "Project settings · Nexus Cloud" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, limits, modelSettings, spent] = await Promise.all([
    getProject(projectId),
    getWorkspaceLimits(projectId),
    getProjectModelSettings(projectId),
    projectSpentMicros(projectId),
  ]);
  const allowed = new Set(
    modelSettings?.allowed_providers ?? [
      "anthropic",
      "openai",
      "gemini",
      "xai",
      "deepseek",
      "groq",
      "openrouter",
    ],
  );

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
          Limits for uploads, the sandbox, the terminal and agent approvals. Secrets are not typed
          here.
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
          <div className="grid grid-cols-2 gap-4">
            <TextField
              name="nodeMajor"
              label="Node version"
              type="number"
              defaultValue={limits.nodeMajor}
              required
            />
            <TextField
              name="agentMaxIterations"
              label="Agent iteration cap"
              type="number"
              defaultValue={limits.agentMaxIterations}
              required
            />
            <TextField
              name="installCommand"
              label="Install command"
              defaultValue={limits.installCommand}
              required
            />
            <TextField
              name="testCommand"
              label="Test command"
              defaultValue={limits.testCommand}
              required
            />
            <TextField
              name="buildCommand"
              label="Build command"
              defaultValue={limits.buildCommand}
              required
            />
            <TextField
              name="startCommand"
              label="Start command"
              defaultValue={limits.startCommand}
              required
            />
            <TextField
              name="terminalIdleSeconds"
              label="Terminal idle timeout (seconds)"
              type="number"
              defaultValue={limits.terminalIdleSeconds}
              required
            />
            <TextField
              name="terminalMaxSessions"
              label="Open terminals"
              type="number"
              defaultValue={limits.terminalMaxSessions}
              required
            />
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Command approval</span>
            <select
              name="approvalMode"
              defaultValue={limits.approvalMode}
              className="w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2"
            >
              <option value="safe_list">Safe list (install, test, read-only git)</option>
              <option value="ask">Ask every time</option>
              <option value="custom">Custom list</option>
            </select>
          </label>
          <TextField
            name="customCommands"
            label="Custom commands"
            hint="One command per line. Used when approval is set to custom. The denylist still refuses them."
            defaultValue={limits.customCommands.join("\n")}
          />
          <TextField
            name="plainEnv"
            label="Non-secret environment variables"
            hint="NAME=value, one per line. Names containing SECRET, TOKEN, PASSWORD, KEY or CREDENTIAL are rejected."
            defaultValue={limits.plainEnv}
          />
        </ActionForm>
      </section>

      <section aria-labelledby="models-heading" className="space-y-3">
        <h2 id="models-heading" className="text-base font-semibold">
          Models
        </h2>
        <p className="text-sm text-nx-muted">
          Spent {formatMicros(spent)} of {formatUsd(Number(modelSettings?.monthly_budget_usd ?? 5))}{" "}
          this month. When a provider is down, rate-limited or declines, the next allowed provider
          answers and the switch is shown. Narrow the providers, or turn fallback off, for a project
          with privacy needs.
        </p>
        <ActionForm action={updateProjectModelSettings} submitLabel="Save model settings">
          <Hidden name="projectId" value={project.id} />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              name="monthlyBudget"
              label="Project budget (USD / month)"
              type="number"
              defaultValue={modelSettings?.monthly_budget_usd ?? 5}
              required
            />
            <TextField
              name="runBudget"
              label="Per-run cap (USD)"
              type="number"
              defaultValue={modelSettings?.run_budget_usd ?? 0.25}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowFallback"
              defaultChecked={modelSettings?.allow_fallback ?? true}
            />
            If a provider is down or declines, try the next allowed one and show the switch
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">Providers allowed</legend>
            {(
              [
                ["anthropic", "Anthropic"],
                ["openai", "OpenAI"],
                ["gemini", "Gemini"],
                ["xai", "xAI"],
                ["deepseek", "DeepSeek"],
                ["groq", "Groq"],
                ["openrouter", "OpenRouter"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allowed"
                  value={value}
                  defaultChecked={allowed.has(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </section>
    </main>
  );
}
