import type { RepoSummary } from "@nexus/integrations";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { buttonSecondary, SelectField } from "@/components/ui/fields";
import { getGitHubApp, gitHubFailureMessage } from "@/lib/github/app";
import { getGitHubIntegration, integrationHealth } from "@/lib/github/queries";
import { getProjectRepository, getRepositoryActivity } from "@/lib/github/repository";
import { getProject } from "@/lib/projects/queries";
import { importRepository, syncRepositoryNow } from "./actions";

export const metadata: Metadata = { title: "Repository · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const when = (value: string | null) =>
  value ? `${dateFormat.format(new Date(value))} UTC` : "never";

const CHECK_STYLES = {
  success: "text-nx-ok",
  failure: "text-nx-danger",
  pending: "text-nx-warn",
  none: "text-nx-muted",
} as const;
const CHECK_LABELS = {
  success: "Checks passed",
  failure: "Checks failed",
  pending: "Checks running",
  none: "No checks",
};
const LINK_LABELS = { branch: "Branch", commit: "Commit", pull_request: "Pull request" } as const;

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, repo] = await Promise.all([
    getProject(projectId),
    getProjectRepository(projectId),
  ]);
  const app = getGitHubApp();

  if (!repo) {
    const integration = await getGitHubIntegration();
    let choices: RepoSummary[] = [];
    let problem: string | null = null;
    if (app.configured && integration?.status === "active") {
      try {
        const { token } = await app.client.createInstallationToken(integration.installation_id);
        choices = await app.client.listInstallationRepos(token);
      } catch (error) {
        problem = gitHubFailureMessage(error);
      }
    }

    return (
      <main id="main" className="max-w-3xl space-y-4 p-6">
        <h1 className="text-lg font-semibold">Repository</h1>
        {!app.configured || !integration ? (
          <p className="text-sm text-nx-muted">
            No repository yet.{" "}
            <Link href="/settings/integrations" className="text-nx-blue underline">
              Connect GitHub
            </Link>{" "}
            first, then import a repository here.
          </p>
        ) : integration.status !== "active" ? (
          <p role="alert" className="text-sm text-nx-warn">
            The GitHub installation is {integration.status}. Check it in Settings → Integrations.
          </p>
        ) : problem ? (
          <p role="alert" className="text-sm text-nx-warn">
            {problem}
          </p>
        ) : choices.length === 0 ? (
          <p className="text-sm text-nx-muted">
            The GitHub App can&apos;t see any repositories yet. Give it access in Settings →
            Integrations → Change repository access.
          </p>
        ) : (
          <ActionForm action={importRepository} submitLabel="Import repository">
            <input type="hidden" name="projectId" value={project.id} />
            <SelectField
              name="githubRepoId"
              label="Repository"
              defaultValue={String(choices[0]!.id)}
              options={choices.map((choice) => ({
                value: String(choice.id),
                label: `${choice.fullName}${choice.private ? " (private)" : ""}`,
              }))}
            />
            <p className="text-xs text-nx-muted">
              Nexus reads branches, commits, pull requests and checks. Name branches and commits
              with a task, like <span className="font-mono">task/NX-12-login</span>, to link them to
              the board.
            </p>
          </ActionForm>
        )}
      </main>
    );
  }

  const { branches, pulls, commits, links } = await getRepositoryActivity(repo.id);
  const health = integrationHealth(repo.integrations, 0);

  return (
    <main id="main" className="space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            <a href={repo.html_url} className="hover:underline" rel="noreferrer" target="_blank">
              {repo.full_name}
            </a>
          </h1>
          <p className="text-sm text-nx-muted">
            Default branch <span className="font-mono">{repo.default_branch}</span> · last synced{" "}
            {when(repo.last_synced_at)}
          </p>
          <p
            role={health.state === "degraded" ? "alert" : undefined}
            className={`mt-1 text-sm ${health.state === "degraded" ? "text-nx-warn" : "text-nx-muted"}`}
          >
            GitHub: {health.state === "degraded" ? `degraded. ${health.reason}` : health.reason}
          </p>
        </div>
        <ActionForm
          action={syncRepositoryNow}
          submitLabel="Sync now"
          buttonClassName={buttonSecondary}
        >
          <input type="hidden" name="projectId" value={project.id} />
        </ActionForm>
      </div>

      <section aria-labelledby="pulls-heading" className="space-y-2">
        <h2 id="pulls-heading" className="font-semibold">
          Pull requests
        </h2>
        {pulls.length === 0 ? (
          <p className="text-sm text-nx-muted">No pull requests yet.</p>
        ) : (
          <ul className="divide-y divide-nx-border text-sm" aria-label="Pull requests">
            {pulls.map((pr) => (
              <li key={pr.number} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <a
                  href={pr.html_url}
                  className="font-mono text-nx-blue hover:underline"
                  rel="noreferrer"
                  target="_blank"
                >
                  #{pr.number}
                </a>
                <span>{pr.title}</span>
                <span className="text-xs text-nx-muted">
                  {pr.state} · <span className="font-mono">{pr.head_ref}</span> → {pr.base_ref}
                </span>
                <span className={`text-xs ${CHECK_STYLES[pr.checks as keyof typeof CHECK_STYLES]}`}>
                  {CHECK_LABELS[pr.checks as keyof typeof CHECK_LABELS]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="branches-heading" className="space-y-2">
          <h2 id="branches-heading" className="font-semibold">
            Branches
          </h2>
          <ul className="divide-y divide-nx-border text-sm" aria-label="Branches">
            {branches.map((branch) => (
              <li key={branch.name} className="flex justify-between gap-3 py-1.5">
                <span className="font-mono">
                  {branch.name}
                  {branch.protected && (
                    <span className="ml-2 text-xs text-nx-muted">protected</span>
                  )}
                </span>
                <span className="font-mono text-xs text-nx-muted">
                  {branch.head_sha.slice(0, 7)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="commits-heading" className="space-y-2">
          <h2 id="commits-heading" className="font-semibold">
            Recent commits
          </h2>
          <ul className="divide-y divide-nx-border text-sm" aria-label="Recent commits">
            {commits.map((commit) => (
              <li key={commit.sha} className="py-1.5">
                <span className="font-mono text-xs text-nx-muted">{commit.sha.slice(0, 7)}</span>{" "}
                {commit.message.split("\n")[0]}
                <span className="block text-xs text-nx-muted">
                  {commit.author_name ?? "unknown"} · {commit.branch} · {when(commit.authored_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="links-heading" className="space-y-2">
        <h2 id="links-heading" className="font-semibold">
          Linked to tasks
        </h2>
        {links.length === 0 ? (
          <p className="text-sm text-nx-muted">
            Nothing yet. Mention a task (e.g. <span className="font-mono">NX-3</span>) in a branch
            name, commit message or pull request title.
          </p>
        ) : (
          <ul className="divide-y divide-nx-border text-sm" aria-label="Work linked to tasks">
            {links.map((link) => (
              <li
                key={`${link.tasks.id}-${link.kind}-${link.ref}`}
                className="flex flex-wrap gap-x-3 py-1.5"
              >
                <Link
                  href={`/projects/${project.id}/tasks/${link.tasks.id}`}
                  className="font-mono text-nx-blue hover:underline"
                >
                  NX-{link.tasks.ref}
                </Link>
                <span className="text-nx-muted">{LINK_LABELS[link.kind]}</span>
                <span className="font-mono text-xs">
                  {link.kind === "commit"
                    ? link.ref.slice(0, 7)
                    : link.kind === "pull_request"
                      ? `#${link.ref}`
                      : link.ref}
                </span>
                {link.title && link.kind !== "branch" && <span>{link.title}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
