import type { Metadata } from "next";
import Link from "next/link";
import { getGitHubIntegration } from "@/lib/github/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Repositories · Nexus Cloud" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Every imported repository and the project it belongs to (RLS: the owner's workspace only). */
export default async function RepositoriesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: repos }, integration] = await Promise.all([
    supabase
      .from("repositories")
      .select("id, full_name, default_branch, last_synced_at, projects!inner(id, name)")
      .order("full_name"),
    getGitHubIntegration(),
  ]);

  return (
    <main id="main" className="max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Repositories</h1>
      {!integration ? (
        <p className="text-sm text-nx-muted">
          GitHub isn&apos;t connected.{" "}
          <Link href="/settings/integrations" className="text-nx-blue underline">
            Connect it in Settings
          </Link>
          , then import a repository from a project&apos;s Repository tab.
        </p>
      ) : (repos ?? []).length === 0 ? (
        <p className="text-sm text-nx-muted">
          Connected to {integration.account_login}. Import a repository from a project&apos;s
          Repository tab.
        </p>
      ) : (
        <ul className="divide-y divide-nx-border" aria-label="Imported repositories">
          {(repos ?? []).map((repo) => (
            <li key={repo.id} className="py-2">
              <Link
                href={`/projects/${repo.projects.id}/repository`}
                className="font-mono text-nx-blue hover:underline"
              >
                {repo.full_name}
              </Link>
              <p className="text-xs text-nx-muted">
                {repo.projects.name} · {repo.default_branch} · synced{" "}
                {repo.last_synced_at
                  ? `${dateFormat.format(new Date(repo.last_synced_at))} UTC`
                  : "never"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
