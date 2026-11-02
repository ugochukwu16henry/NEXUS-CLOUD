import type { Metadata } from "next";
import Link from "next/link";
import { createRequirement } from "./actions";
import { PRIORITY_OPTIONS, RequirementFields } from "@/components/projects/requirement-fields";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Hidden } from "@/components/ui/fields";
import { getProject, getRequirements } from "@/lib/projects/queries";

export const metadata: Metadata = { title: "Requirements · Nexus Cloud" };

const APPROVAL_TONE = { draft: "muted", approved: "ok", rejected: "danger" } as const;
const PRIORITY = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, o.label]));

export default async function RequirementsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, requirements] = await Promise.all([
    getProject(projectId),
    getRequirements(projectId),
  ]);

  return (
    <main id="main" className="space-y-8 p-6">
      <h1 className="text-lg font-semibold">Requirements</h1>

      {requirements.length === 0 ? (
        <p className="text-sm text-nx-muted">No requirements yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Requirements</caption>
          <thead className="text-xs text-nx-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                Ref
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Title
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Priority
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Approval
              </th>
              <th scope="col" className="py-1 font-medium">
                Version
              </th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((requirement) => (
              <tr key={requirement.id} className="border-t border-nx-border">
                <td className="py-2 pr-4 font-mono text-xs">REQ-{requirement.ref}</td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/projects/${project.id}/requirements/${requirement.id}`}
                    className="text-nx-blue underline"
                  >
                    {requirement.title}
                  </Link>
                </td>
                <td className="py-2 pr-4">{PRIORITY[requirement.priority]}</td>
                <td className="py-2 pr-4">
                  <Badge tone={APPROVAL_TONE[requirement.approval]}>{requirement.approval}</Badge>
                </td>
                <td className="py-2">v{requirement.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section
        aria-labelledby="new-requirement-heading"
        className="max-w-2xl space-y-4 rounded-lg border border-nx-border bg-nx-surface p-5"
      >
        <h2 id="new-requirement-heading" className="text-base font-semibold">
          New requirement
        </h2>
        <ActionForm action={createRequirement} submitLabel="Add requirement" resetOnSuccess>
          <Hidden name="projectId" value={project.id} />
          <RequirementFields />
        </ActionForm>
      </section>
    </main>
  );
}
