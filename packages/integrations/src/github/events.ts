import { z } from "zod";
import { branchFromRef } from "../task-refs";

/**
 * Turns a verified GitHub webhook into one of the few events Nexus acts on. Only the fields we use
 * are validated; a payload missing them throws, so the delivery is retried and, if it never
 * parses, ends in the dead-letter view instead of being half-applied.
 */

const repository = z.object({ id: z.number(), full_name: z.string() });
const installationRef = z.object({ id: z.number() }).optional();
const sha = z.string().regex(/^[0-9a-f]{40}$/);

const pushPayload = z.object({
  ref: z.string(),
  after: sha,
  deleted: z.boolean().default(false),
  repository,
  installation: installationRef,
  commits: z
    .array(
      z.object({
        id: sha,
        message: z.string(),
        timestamp: z.string().nullish(),
        url: z.string().nullish(),
        author: z.object({ name: z.string().nullish() }).nullish(),
      }),
    )
    .default([]),
});

const deletePayload = z.object({
  ref: z.string(),
  ref_type: z.string(),
  repository,
  installation: installationRef,
});

const pullRequestPayload = z.object({
  action: z.string(),
  repository,
  installation: installationRef,
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    state: z.string(),
    merged: z.boolean().nullish(),
    html_url: z.string(),
    updated_at: z.string().nullish(),
    head: z.object({ ref: z.string(), sha }),
    base: z.object({ ref: z.string() }),
  }),
});

const checkSuitePayload = z.object({
  action: z.string(),
  repository,
  installation: installationRef,
  check_suite: z.object({
    head_sha: sha,
    status: z.string().nullish(),
    conclusion: z.string().nullish(),
  }),
});

const installationPayload = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({ login: z.string() }),
    permissions: z.record(z.string(), z.string()).default({}),
  }),
});

export type GitHubEvent =
  | {
      kind: "push";
      installationId: number | null;
      repoId: number;
      branch: string;
      headSha: string;
      deleted: boolean;
      commits: {
        sha: string;
        message: string;
        authorName: string | null;
        authoredAt: string | null;
        url: string | null;
      }[];
    }
  | { kind: "branch_deleted"; installationId: number | null; repoId: number; branch: string }
  | {
      kind: "pull_request";
      installationId: number | null;
      repoId: number;
      action: string;
      pr: {
        number: number;
        title: string;
        state: "open" | "closed" | "merged";
        headRef: string;
        headSha: string;
        baseRef: string;
        htmlUrl: string;
        updatedAt: string | null;
      };
    }
  | {
      kind: "checks";
      installationId: number | null;
      repoId: number;
      headSha: string;
      checks: "pending" | "success" | "failure";
    }
  | {
      kind: "installation";
      installationId: number;
      action: string;
      accountLogin: string;
      permissions: Record<string, string>;
    }
  | { kind: "ignored"; reason: string };

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
]);

export function normalizeEvent(event: string, payload: unknown): GitHubEvent {
  switch (event) {
    case "push": {
      const p = pushPayload.parse(payload);
      const branch = branchFromRef(p.ref);
      if (!branch) return { kind: "ignored", reason: "tag push" };
      return {
        kind: "push",
        installationId: p.installation?.id ?? null,
        repoId: p.repository.id,
        branch,
        headSha: p.after,
        deleted: p.deleted,
        commits: p.commits.map((commit) => ({
          sha: commit.id,
          message: commit.message,
          authorName: commit.author?.name ?? null,
          authoredAt: commit.timestamp ?? null,
          url: commit.url ?? null,
        })),
      };
    }
    case "delete": {
      const p = deletePayload.parse(payload);
      if (p.ref_type !== "branch") return { kind: "ignored", reason: "tag deleted" };
      return {
        kind: "branch_deleted",
        installationId: p.installation?.id ?? null,
        repoId: p.repository.id,
        branch: p.ref,
      };
    }
    case "pull_request": {
      const p = pullRequestPayload.parse(payload);
      const pr = p.pull_request;
      return {
        kind: "pull_request",
        installationId: p.installation?.id ?? null,
        repoId: p.repository.id,
        action: p.action,
        pr: {
          number: pr.number,
          title: pr.title,
          state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open",
          headRef: pr.head.ref,
          headSha: pr.head.sha,
          baseRef: pr.base.ref,
          htmlUrl: pr.html_url,
          updatedAt: pr.updated_at ?? null,
        },
      };
    }
    case "check_suite": {
      const p = checkSuitePayload.parse(payload);
      const suite = p.check_suite;
      const checks =
        suite.status !== "completed"
          ? "pending"
          : FAILED_CONCLUSIONS.has(suite.conclusion ?? "")
            ? "failure"
            : "success";
      return {
        kind: "checks",
        installationId: p.installation?.id ?? null,
        repoId: p.repository.id,
        headSha: suite.head_sha,
        checks,
      };
    }
    case "installation": {
      const p = installationPayload.parse(payload);
      return {
        kind: "installation",
        installationId: p.installation.id,
        action: p.action,
        accountLogin: p.installation.account.login,
        permissions: p.installation.permissions,
      };
    }
    default:
      return { kind: "ignored", reason: `event ${event} is not used` };
  }
}
