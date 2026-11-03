import type { Metadata } from "next";
import Link from "next/link";
import { createProject } from "./actions";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, TextField } from "@/components/ui/fields";
import { listProjects } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Projects · Nexus Cloud" };

const STATUS_TONE = { active: "teal", on_hold: "warn", completed: "ok" } as const;
const STATUS_LABEL = { active: "Active", on_hold: "On hold", completed: "Completed" } as const;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main id="main" className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Projects</h1>

      {projects.length === 0 ? (
        <p className="text-sm text-nx-muted">No projects yet. Create the first one below.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Projects</caption>
          <thead className="text-xs text-nx-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                Project
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Open tasks
              </th>
              <th scope="col" className="py-1 font-medium">
                Budget
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-t border-nx-border">
                <td className="py-2 pr-4">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-medium text-nx-blue underline"
                  >
                    {project.name}
                  </Link>
                  {project.archived_at && (
                    <span className="ml-2">
                      <Badge>Archived</Badge>
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {project.tasks.open}{" "}
                  <span className="text-nx-muted">of {project.tasks.total}</span>
                </td>
                <td className="py-2">{usd.format(Number(project.budget_usd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section
        aria-labelledby="new-project-heading"
        className="max-w-xl space-y-4 rounded-lg border border-nx-border bg-nx-surface p-5"
      >
        <h2 id="new-project-heading" className="text-lg font-semibold">
          New project
        </h2>
        <ActionForm action={createProject} submitLabel="Create project">
          <TextField name="name" label="Name" required maxLength={120} />
          <TextField
            name="stack"
            label="Stack"
            maxLength={200}
            hint="For example: Next.js, Supabase, Vercel"
          />
          <TextField
            name="environments"
            label="Environments"
            defaultValue="dev, staging, production"
            hint="Comma-separated, lower-case."
          />
          <TextField name="budgetUsd" label="Budget (USD)" type="number" inputMode="decimal" />
        </ActionForm>
      </section>
    </main>
  );
}
