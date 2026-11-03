import type { ReactNode } from "react";
import { ProjectNav } from "@/components/projects/project-nav";
import { Badge } from "@/components/ui/fields";
import { getProject } from "@/lib/projects/queries";

const STATUS = {
  active: { label: "Active", tone: "teal" },
  on_hold: { label: "On hold", tone: "warn" },
  completed: { label: "Completed", tone: "ok" },
} as const;

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const status = STATUS[project.status];

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-1 px-4 pt-4 sm:px-6 sm:pt-5">
        <p className="text-xs text-nx-muted">
          Project{project.client_name ? ` · ${project.client_name}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xl font-semibold">{project.name}</p>
          <Badge tone={status.tone}>{status.label}</Badge>
          {project.archived_at && <Badge tone="warn">Archived</Badge>}
        </div>
      </div>
      <ProjectNav projectId={project.id} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
