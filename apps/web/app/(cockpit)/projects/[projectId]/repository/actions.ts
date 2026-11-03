"use server";

import { GitHubError, recordHealth, syncRepository } from "@nexus/integrations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { getGitHubApp, gitHubFailureMessage } from "@/lib/github/app";
import { getProjectRepository, toSyncTarget } from "@/lib/github/repository";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const importInput = z.object({ projectId: id, githubRepoId: z.coerce.number().int().positive() });
const syncInput = z.object({ projectId: id });

/**
 * Imports one repository from the GitHub installation into a project and syncs its branches,
 * commits and pull requests. The project and integration are read as the signed-in user (RLS);
 * integration data is written server-side, since browsers have no write access to it.
 */
export const importRepository = defineAction(
  { name: "repository.import", access: "project:write", parse: parseForm(importInput) },
  async ({ projectId, githubRepoId }, { viewer }) => {
    const audit = { projectId };
    const app = getGitHubApp();
    if (!app.configured) {
      return { status: "error", message: "GitHub isn't configured on this server.", audit };
    }

    const supabase = await createSupabaseServerClient();
    const [{ data: project }, { data: integration }] = await Promise.all([
      supabase.from("projects").select("id, workspace_id").eq("id", projectId).maybeSingle(),
      supabase
        .from("integrations")
        .select("id, installation_id, workspace_id, status")
        .eq("provider", "github")
        .maybeSingle(),
    ]);
    if (!project) return { status: "error", message: "That project no longer exists.", audit };
    if (
      !integration ||
      integration.status !== "active" ||
      integration.workspace_id !== project.workspace_id
    ) {
      return {
        status: "error",
        message: "Connect GitHub in Settings → Integrations first.",
        audit,
      };
    }

    const admin = createSupabaseAdminClient();
    let repoRow: { id: string } | null = null;
    try {
      // A token for this one repository proves the installation can see it.
      const { token } = await app.client.createInstallationToken(integration.installation_id, {
        repositoryIds: [githubRepoId],
      });
      const [repo] = (await app.client.listInstallationRepos(token)).filter(
        (candidate) => candidate.id === githubRepoId,
      );
      if (!repo) {
        return { status: "error", message: "The GitHub App can't see that repository.", audit };
      }

      const { data, error } = await admin
        .from("repositories")
        .insert({
          project_id: projectId,
          integration_id: integration.id,
          github_repo_id: repo.id,
          full_name: repo.fullName,
          default_branch: repo.defaultBranch,
          private: repo.private,
          html_url: repo.htmlUrl,
          imported_by: viewer?.userId ?? null,
        })
        .select("id")
        .single();
      if (error) {
        const message = error.message.includes("repositories_project_id_key")
          ? "This project already has a repository."
          : error.message.includes("repositories_integration_id_github_repo_id_key")
            ? "That repository is already imported into another project."
            : "The repository couldn't be saved.";
        return { status: "error", message, audit };
      }
      repoRow = data;

      const result = await syncRepository(admin, app.client, {
        id: data.id,
        projectId,
        workspaceId: project.workspace_id,
        fullName: repo.fullName,
        githubRepoId: repo.id,
        defaultBranch: repo.defaultBranch,
        integrationId: integration.id,
        installationId: integration.installation_id,
      });

      revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "success",
        message: `Imported ${repo.fullName}: ${result.branches} branches, ${result.pullRequests} pull requests.`,
        audit: {
          projectId,
          targetType: "repository",
          targetId: data.id,
          metadata: { fullName: repo.fullName, ...result },
        },
      };
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      await recordHealth(admin, integration.id, error);
      // Imported but not yet synced: keep the row, so "Sync now" can finish the job.
      if (repoRow) revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "error",
        message: gitHubFailureMessage(error),
        audit: { ...audit, metadata: { status: error.status } },
      };
    }
  },
);

/** Re-reads branches, commits and pull requests from GitHub (webhooks keep them fresh otherwise). */
export const syncRepositoryNow = defineAction(
  { name: "repository.sync", access: "project:write", parse: parseForm(syncInput) },
  async ({ projectId }) => {
    const app = getGitHubApp();
    const repo = await getProjectRepository(projectId);
    if (!app.configured || !repo) {
      return {
        status: "error",
        message: "This project has no repository to sync.",
        audit: { projectId },
      };
    }
    const audit = { projectId, targetType: "repository", targetId: repo.id };
    try {
      const result = await syncRepository(
        createSupabaseAdminClient(),
        app.client,
        toSyncTarget(repo),
      );
      revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "success",
        message: `Synced: ${result.branches} branches, ${result.commits} commits, ${result.pullRequests} pull requests.`,
        audit: { ...audit, metadata: result },
      };
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "error",
        message: gitHubFailureMessage(error),
        audit: { ...audit, metadata: { status: error.status } },
      };
    }
  },
);
