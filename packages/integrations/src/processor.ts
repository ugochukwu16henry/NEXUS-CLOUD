import { randomUUID } from "node:crypto";
import { normalizeEvent, type GitHubEvent } from "./github/events";
import { auditSystem, check, findRepository, linkTasks, type Db } from "./store";

/** After this many failed attempts a delivery is "dead" and waits for the owner in the dead-letter view. */
export const MAX_ATTEMPTS = 5;

/** 30 s, 1 min, 2 min, 4 min… capped at an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(3_600_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

export type DeliveryRow = {
  id: number;
  delivery_id: string;
  event: string;
  payload: unknown;
  attempts: number;
};

export type ProcessResult = { processed: number; failed: number; dead: number };

/**
 * Claims due deliveries and applies each one. Safe to run from several places at once (the
 * webhook route right after receipt, and the worker's retry loop): claiming uses SKIP LOCKED, and
 * applying a delivery twice only re-upserts the same rows.
 */
export async function processDueDeliveries(
  db: Db,
  options: { batchSize?: number; deliveryId?: string; now?: () => Date } = {},
): Promise<ProcessResult> {
  const now = options.now ?? (() => new Date());
  const rows = check(
    await db.rpc("claim_webhook_events", {
      batch_size: options.batchSize ?? 10,
      ...(options.deliveryId ? { only_delivery: options.deliveryId } : {}),
    }),
    "claim deliveries",
  );

  const result: ProcessResult = { processed: 0, failed: 0, dead: 0 };
  for (const row of rows ?? []) {
    try {
      await applyDelivery(db, row);
      check(
        await db
          .from("webhook_events")
          .update({ status: "processed", processed_at: now().toISOString(), last_error: null })
          .eq("id", row.id),
        "mark processed",
      );
      result.processed += 1;
    } catch (error) {
      const dead = row.attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);
      check(
        await db
          .from("webhook_events")
          .update({
            status: dead ? "dead" : "failed",
            last_error: message.slice(0, 500),
            next_attempt_at: new Date(now().getTime() + retryDelayMs(row.attempts)).toISOString(),
          })
          .eq("id", row.id),
        "mark failed",
      );
      if (dead) result.dead += 1;
      else result.failed += 1;
    }
  }
  return result;
}

/** Applies one verified delivery to the database. Throws to have it retried. */
export async function applyDelivery(db: Db, row: DeliveryRow): Promise<void> {
  const event = normalizeEvent(row.event, row.payload);
  const correlationId = randomUUID();
  const meta = { delivery: row.delivery_id };

  switch (event.kind) {
    case "ignored":
      return;
    case "installation":
      return applyInstallation(db, event, correlationId);
    default:
      break;
  }

  const repo = await findRepository(db, event.installationId, event.repoId);
  if (!repo) return; // Not imported into any project: nothing to update.
  const base = { workspaceId: repo.workspaceId, projectId: repo.projectId, correlationId };

  switch (event.kind) {
    case "push": {
      if (event.deleted) {
        check(
          await db
            .from("repo_branches")
            .delete()
            .eq("repository_id", repo.id)
            .eq("name", event.branch),
          "delete branch",
        );
        await auditSystem(db, {
          ...base,
          action: "github.branch_delete",
          result: "success",
          targetType: "repository",
          targetId: repo.id,
          metadata: { ...meta, branch: event.branch },
        });
        return;
      }
      check(
        await db.from("repo_branches").upsert({
          repository_id: repo.id,
          name: event.branch,
          head_sha: event.headSha,
          updated_at: new Date().toISOString(),
        }),
        "upsert branch",
      );
      if (event.commits.length > 0) {
        check(
          await db.from("repo_commits").upsert(
            event.commits.map((commit) => ({
              repository_id: repo.id,
              sha: commit.sha,
              branch: event.branch,
              message: commit.message.slice(0, 2000),
              author_name: commit.authorName?.slice(0, 200) ?? null,
              authored_at: commit.authoredAt,
              html_url: commit.url,
            })),
          ),
          "upsert commits",
        );
      }
      const tasks = await linkTasks(db, repo, [
        { kind: "branch", ref: event.branch, title: event.branch, texts: [event.branch] },
        ...event.commits.map((commit) => ({
          kind: "commit" as const,
          ref: commit.sha,
          title: commit.message.split("\n")[0],
          url: commit.url,
          texts: [commit.message],
        })),
      ]);
      await auditSystem(db, {
        ...base,
        action: "github.push",
        result: "success",
        targetType: "repository",
        targetId: repo.id,
        metadata: { ...meta, branch: event.branch, commits: event.commits.length, tasks },
      });
      return;
    }
    case "branch_deleted": {
      check(
        await db
          .from("repo_branches")
          .delete()
          .eq("repository_id", repo.id)
          .eq("name", event.branch),
        "delete branch",
      );
      return;
    }
    case "pull_request": {
      const pr = event.pr;
      check(
        await db.from("repo_pull_requests").upsert({
          repository_id: repo.id,
          number: pr.number,
          title: pr.title.slice(0, 500),
          state: pr.state,
          head_ref: pr.headRef,
          head_sha: pr.headSha,
          base_ref: pr.baseRef,
          html_url: pr.htmlUrl,
          updated_at: pr.updatedAt ?? new Date().toISOString(),
        }),
        "upsert pull request",
      );
      const tasks = await linkTasks(db, repo, [
        {
          kind: "pull_request",
          ref: String(pr.number),
          title: pr.title,
          url: pr.htmlUrl,
          texts: [pr.headRef, pr.title],
        },
      ]);
      // New commits on a PR ("synchronize") are already on the timeline as pushes.
      if (["opened", "closed", "reopened"].includes(event.action)) {
        await auditSystem(db, {
          ...base,
          action: "github.pull_request",
          result: "success",
          targetType: "repository",
          targetId: repo.id,
          metadata: {
            ...meta,
            number: pr.number,
            title: pr.title.slice(0, 200),
            state: event.action === "closed" ? pr.state : event.action,
            tasks,
          },
        });
      }
      return;
    }
    case "checks": {
      check(
        await db
          .from("repo_pull_requests")
          .update({ checks: event.checks })
          .eq("repository_id", repo.id)
          .eq("head_sha", event.headSha),
        "update checks",
      );
      return;
    }
  }
}

async function applyInstallation(
  db: Db,
  event: Extract<GitHubEvent, { kind: "installation" }>,
  correlationId: string,
): Promise<void> {
  const status: "active" | "suspended" | "removed" | null =
    event.action === "deleted"
      ? "removed"
      : event.action === "suspend"
        ? "suspended"
        : event.action === "unsuspend"
          ? "active"
          : null;
  const changes: {
    status?: "active" | "suspended" | "removed";
    permissions?: Record<string, string>;
  } = {
    ...(status ? { status } : {}),
    ...(event.action === "new_permissions_accepted" ? { permissions: event.permissions } : {}),
  };
  if (Object.keys(changes).length === 0) return;

  const updated = check(
    await db
      .from("integrations")
      .update(changes)
      .eq("installation_id", event.installationId)
      .select("id, workspace_id"),
    "update installation",
  );
  for (const integration of updated ?? []) {
    await auditSystem(db, {
      workspaceId: integration.workspace_id,
      action: "integration.github_update",
      result: "success",
      targetType: "integration",
      targetId: integration.id,
      correlationId,
      metadata: { action: event.action, account: event.accountLogin },
    });
  }
}
