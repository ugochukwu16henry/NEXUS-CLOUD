import type { GitHubClient } from "./github/client";
import { GitHubError } from "./github/client";
import { check, linkTasks, type Db, type RepoContext } from "./store";

export type SyncTarget = RepoContext & {
  githubRepoId: number;
  defaultBranch: string;
  integrationId: string;
  installationId: number;
};

export type SyncResult = {
  branches: number;
  commits: number;
  pullRequests: number;
  tasks: number[];
};

/**
 * Pulls branches, recent commits on the default branch and recent pull requests (with their check
 * status) into the database. Uses a token minted for this one repository with read-only access.
 * Webhooks keep the data fresh afterwards; this runs on import and on "Sync now".
 */
export async function syncRepository(
  db: Db,
  github: GitHubClient,
  target: SyncTarget,
): Promise<SyncResult> {
  try {
    const { token } = await github.createInstallationToken(target.installationId, {
      repositoryIds: [target.githubRepoId],
    });
    const [branches, commits, pulls] = await Promise.all([
      github.listBranches(token, target.fullName),
      github.listCommits(token, target.fullName, target.defaultBranch),
      github.listPullRequests(token, target.fullName),
    ]);
    const openPulls = pulls.filter((pr) => pr.state === "open").slice(0, 10);
    const checks = await Promise.all(
      openPulls.map((pr) => github.checksFor(token, target.fullName, pr.headSha)),
    );
    const checksByNumber = new Map(openPulls.map((pr, index) => [pr.number, checks[index]!]));
    const now = new Date().toISOString();

    // Branches mirror GitHub exactly: ones deleted while webhooks were missed disappear here.
    check(await db.from("repo_branches").delete().eq("repository_id", target.id), "clear branches");
    if (branches.length > 0) {
      check(
        await db.from("repo_branches").insert(
          branches.map((branch) => ({
            repository_id: target.id,
            name: branch.name,
            head_sha: branch.headSha,
            protected: branch.protected,
            updated_at: now,
          })),
        ),
        "store branches",
      );
    }
    if (commits.length > 0) {
      check(
        await db.from("repo_commits").upsert(
          commits.map((commit) => ({
            repository_id: target.id,
            sha: commit.sha,
            branch: target.defaultBranch,
            message: commit.message.slice(0, 2000),
            author_name: commit.authorName?.slice(0, 200) ?? null,
            authored_at: commit.authoredAt,
            html_url: commit.htmlUrl,
          })),
        ),
        "store commits",
      );
    }
    if (pulls.length > 0) {
      check(
        await db.from("repo_pull_requests").upsert(
          pulls.map((pr) => ({
            repository_id: target.id,
            number: pr.number,
            title: pr.title.slice(0, 500),
            state: pr.state,
            head_ref: pr.headRef,
            head_sha: pr.headSha,
            base_ref: pr.baseRef,
            html_url: pr.htmlUrl,
            checks: checksByNumber.get(pr.number) ?? "none",
            updated_at: pr.updatedAt || now,
          })),
        ),
        "store pull requests",
      );
    }

    const tasks = await linkTasks(db, target, [
      ...branches.map((branch) => ({
        kind: "branch" as const,
        ref: branch.name,
        title: branch.name,
        texts: [branch.name],
      })),
      ...commits.map((commit) => ({
        kind: "commit" as const,
        ref: commit.sha,
        title: commit.message.split("\n")[0],
        url: commit.htmlUrl,
        texts: [commit.message],
      })),
      ...pulls.map((pr) => ({
        kind: "pull_request" as const,
        ref: String(pr.number),
        title: pr.title,
        url: pr.htmlUrl,
        texts: [pr.headRef, pr.title],
      })),
    ]);

    check(
      await db.from("repositories").update({ last_synced_at: now }).eq("id", target.id),
      "mark synced",
    );
    await recordHealth(db, target.integrationId, null);
    return {
      branches: branches.length,
      commits: commits.length,
      pullRequests: pulls.length,
      tasks,
    };
  } catch (error) {
    if (error instanceof GitHubError) await recordHealth(db, target.integrationId, error);
    throw error;
  }
}

/** Integration health indicator: when GitHub last answered, and the last failure (message only). */
export async function recordHealth(
  db: Db,
  integrationId: string,
  error: GitHubError | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .from("integrations")
    .update(
      error ? { last_error_at: now, last_error: error.message.slice(0, 300) } : { last_ok_at: now },
    )
    .eq("id", integrationId);
}
