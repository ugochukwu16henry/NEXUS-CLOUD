import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Database } from "@nexus/db";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, processDueDeliveries } from "./processor";

// Integration tests: the webhook processor against the real local Supabase (`supabase start`,
// then `pnpm env:local`). They refuse to run anywhere but localhost.
const envFile = new URL("../../../apps/web/.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) || !key) {
  throw new Error("Integration tests need the local Supabase env (run `pnpm env:local`).");
}
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

const sha = (c: string) => c.repeat(40);
let installationId: number;
let repoGithubId: number;
let projectId: string;
let repositoryId: string;
let integrationId: string;
let taskId: string;

async function deliver(event: string, payload: unknown) {
  const deliveryId = randomUUID();
  const { error } = await db
    .from("webhook_events")
    .insert({ delivery_id: deliveryId, event, payload: payload as never });
  if (error) throw error;
  const result = await processDueDeliveries(db, { deliveryId, batchSize: 1 });
  const { data } = await db
    .from("webhook_events")
    .select("status, attempts, last_error, next_attempt_at")
    .eq("delivery_id", deliveryId)
    .single();
  return { deliveryId, result, row: data! };
}

const push = (overrides: Record<string, unknown> = {}) => ({
  ref: "refs/heads/task/NX-1-login",
  after: sha("a"),
  deleted: false,
  repository: { id: repoGithubId, full_name: "nexus-test-org/int-repo" },
  installation: { id: installationId },
  commits: [
    {
      id: sha("a"),
      message: "NX-1: add login form",
      timestamp: "2026-11-04T09:00:00Z",
      author: { name: "Henry" },
    },
    {
      id: sha("b"),
      message: "Tidy styles",
      timestamp: "2026-11-04T09:05:00Z",
      author: { name: "Henry" },
    },
  ],
  ...overrides,
});

beforeAll(async () => {
  // Fresh, unique fixtures per run; audit rows are append-only, so nothing is deleted afterwards.
  installationId = randomInt(1_000_000, 2_000_000_000);
  repoGithubId = randomInt(1_000_000, 2_000_000_000);
  const workspace = await db
    .from("workspaces")
    .insert({ name: `int-${installationId}` })
    .select("id")
    .single();
  const project = await db
    .from("projects")
    .insert({ workspace_id: workspace.data!.id, name: "Integration" })
    .select("id")
    .single();
  projectId = project.data!.id;
  const task = await db
    .from("tasks")
    .insert({ project_id: projectId, title: "Login" })
    .select("id, ref")
    .single();
  taskId = task.data!.id;
  expect(task.data!.ref).toBe(1);
  const integration = await db
    .from("integrations")
    .insert({
      workspace_id: workspace.data!.id,
      installation_id: installationId,
      account_login: "nexus-test-org",
      account_type: "Organization",
      repository_selection: "selected",
    })
    .select("id")
    .single();
  integrationId = integration.data!.id;
  const repo = await db
    .from("repositories")
    .insert({
      project_id: projectId,
      integration_id: integrationId,
      github_repo_id: repoGithubId,
      full_name: "nexus-test-org/int-repo",
      default_branch: "main",
      private: true,
      html_url: "https://github.com/nexus-test-org/int-repo",
    })
    .select("id")
    .single();
  repositoryId = repo.data!.id;
});

describe("webhook processing (integration)", () => {
  it("applies a push: branch, commits, task links and a timeline event", async () => {
    const { result, row } = await deliver("push", push());
    expect(result).toEqual({ processed: 1, failed: 0, dead: 0 });
    expect(row.status).toBe("processed");

    const [branches, commits, links, audit] = await Promise.all([
      db.from("repo_branches").select("name, head_sha").eq("repository_id", repositoryId),
      db.from("repo_commits").select("sha").eq("repository_id", repositoryId),
      db.from("task_links").select("kind, ref").eq("task_id", taskId).order("kind"),
      db.from("audit_events").select("action, actor_type, metadata").eq("project_id", projectId),
    ]);
    expect(branches.data).toEqual([{ name: "task/NX-1-login", head_sha: sha("a") }]);
    expect(commits.data).toHaveLength(2);
    expect(links.data).toEqual([
      { kind: "branch", ref: "task/NX-1-login" },
      { kind: "commit", ref: sha("a") },
    ]);
    expect(audit.data).toEqual([
      expect.objectContaining({
        action: "github.push",
        actor_type: "system",
        metadata: expect.objectContaining({ branch: "task/NX-1-login", commits: 2, tasks: [1] }),
      }),
    ]);
  });

  it("applying the same work again changes nothing (idempotent)", async () => {
    await deliver("push", push());
    const links = await db.from("task_links").select("ref").eq("task_id", taskId);
    const commits = await db.from("repo_commits").select("sha").eq("repository_id", repositoryId);
    expect(links.data).toHaveLength(2);
    expect(commits.data).toHaveLength(2);
  });

  it("records pull requests and their check results", async () => {
    const pr = {
      action: "opened",
      repository: { id: repoGithubId, full_name: "nexus-test-org/int-repo" },
      installation: { id: installationId },
      pull_request: {
        number: 3,
        title: "Login form",
        state: "open",
        merged: false,
        html_url: "https://github.com/nexus-test-org/int-repo/pull/3",
        head: { ref: "task/NX-1-login", sha: sha("a") },
        base: { ref: "main" },
      },
    };
    expect((await deliver("pull_request", pr)).row.status).toBe("processed");
    await deliver("check_suite", {
      action: "completed",
      repository: pr.repository,
      installation: pr.installation,
      check_suite: { head_sha: sha("a"), status: "completed", conclusion: "failure" },
    });
    const { data } = await db
      .from("repo_pull_requests")
      .select("number, state, checks")
      .eq("repository_id", repositoryId);
    expect(data).toEqual([{ number: 3, state: "open", checks: "failure" }]);
    const link = await db
      .from("task_links")
      .select("ref")
      .eq("task_id", taskId)
      .eq("kind", "pull_request");
    expect(link.data).toEqual([{ ref: "3" }]);
  });

  it("ignores deliveries for repositories nobody imported, or from another installation", async () => {
    const before = await db.from("repo_branches").select("name").eq("repository_id", repositoryId);
    const other = await deliver(
      "push",
      push({ installation: { id: installationId + 1 }, ref: "refs/heads/sneaky" }),
    );
    const unknown = await deliver(
      "push",
      push({ repository: { id: 1, full_name: "x/y" }, ref: "refs/heads/sneaky" }),
    );
    expect(other.row.status).toBe("processed");
    expect(unknown.row.status).toBe("processed");
    const after = await db.from("repo_branches").select("name").eq("repository_id", repositoryId);
    expect(after.data).toEqual(before.data);
  });

  it("retries a delivery that fails, with backoff, then parks it as dead", async () => {
    const started = Date.now();
    const { deliveryId, row } = await deliver("push", { ref: "refs/heads/main" }); // malformed
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBeTruthy();
    expect(Date.parse(row.next_attempt_at)).toBeGreaterThan(started + 20_000);

    // Fast-forward to its last allowed attempt.
    await db
      .from("webhook_events")
      .update({ attempts: MAX_ATTEMPTS - 1, next_attempt_at: new Date().toISOString() })
      .eq("delivery_id", deliveryId);
    const result = await processDueDeliveries(db, { deliveryId, batchSize: 1 });
    expect(result).toEqual({ processed: 0, failed: 0, dead: 1 });
    const { data } = await db
      .from("webhook_events")
      .select("status, attempts")
      .eq("delivery_id", deliveryId)
      .single();
    expect(data).toEqual({ status: "dead", attempts: MAX_ATTEMPTS });
  });

  it("follows installation changes: a suspended installation stops updating repositories", async () => {
    await deliver("installation", {
      action: "suspend",
      installation: { id: installationId, account: { login: "nexus-test-org" }, permissions: {} },
    });
    const { data } = await db
      .from("integrations")
      .select("status")
      .eq("id", integrationId)
      .single();
    expect(data!.status).toBe("suspended");

    await deliver("push", push({ ref: "refs/heads/after-suspend", after: sha("c"), commits: [] }));
    const branch = await db
      .from("repo_branches")
      .select("name")
      .eq("repository_id", repositoryId)
      .eq("name", "after-suspend");
    expect(branch.data).toEqual([]);
  });
});
