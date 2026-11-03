import "server-only";
import type { SyncTarget } from "@nexus/integrations";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The project's imported repository with its integration, or null. RLS limits it to the owner. */
export const getProjectRepository = cache(async (projectId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("repositories")
    .select(
      "id, project_id, github_repo_id, full_name, default_branch, private, html_url, imported_at, last_synced_at, integration_id, integrations!inner(installation_id, workspace_id, status, last_ok_at, last_error_at, last_error)",
    )
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
});

export type ProjectRepository = NonNullable<Awaited<ReturnType<typeof getProjectRepository>>>;

export function toSyncTarget(repo: ProjectRepository): SyncTarget {
  return {
    id: repo.id,
    projectId: repo.project_id,
    workspaceId: repo.integrations.workspace_id,
    fullName: repo.full_name,
    githubRepoId: repo.github_repo_id,
    defaultBranch: repo.default_branch,
    integrationId: repo.integration_id,
    installationId: repo.integrations.installation_id,
  };
}

export async function getRepositoryActivity(repositoryId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: branches }, { data: pulls }, { data: commits }, { data: links }] =
    await Promise.all([
      supabase
        .from("repo_branches")
        .select("name, head_sha, protected, updated_at")
        .eq("repository_id", repositoryId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("repo_pull_requests")
        .select("number, title, state, head_ref, base_ref, html_url, checks, updated_at")
        .eq("repository_id", repositoryId)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("repo_commits")
        .select("sha, branch, message, author_name, authored_at, html_url")
        .eq("repository_id", repositoryId)
        .order("authored_at", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from("task_links")
        .select("kind, ref, title, url, tasks!inner(id, ref, title)")
        .eq("repository_id", repositoryId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  return {
    branches: branches ?? [],
    pulls: pulls ?? [],
    commits: commits ?? [],
    links: links ?? [],
  };
}

/** GitHub work linked to one task (task detail page). */
export async function getTaskLinks(taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("task_links")
    .select("kind, ref, title, url, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
