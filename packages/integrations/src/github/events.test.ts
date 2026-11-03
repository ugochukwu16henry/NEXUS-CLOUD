import { describe, expect, it } from "vitest";
import { normalizeEvent } from "./events";

// Trimmed copies of real GitHub payloads (only the fields Nexus reads, plus a few it ignores).
const repository = { id: 9001, full_name: "nexus-test-org/nexus-pilot-app", private: true };
const installation = { id: 4242 };
const sha = (c: string) => c.repeat(40);

describe("GitHub event normalisation", () => {
  it("reads a push to a branch with its commits", () => {
    const event = normalizeEvent("push", {
      ref: "refs/heads/task/NX-1-login",
      before: sha("0"),
      after: sha("a"),
      created: false,
      deleted: false,
      repository,
      installation,
      sender: { login: "henry" },
      commits: [
        {
          id: sha("a"),
          message: "NX-1: add login form",
          timestamp: "2026-11-04T09:00:00Z",
          url: "https://github.com/nexus-test-org/nexus-pilot-app/commit/aaaa",
          author: { name: "Henry", email: "henry@example.com" },
        },
      ],
    });
    expect(event).toEqual({
      kind: "push",
      installationId: 4242,
      repoId: 9001,
      branch: "task/NX-1-login",
      headSha: sha("a"),
      deleted: false,
      commits: [
        {
          sha: sha("a"),
          message: "NX-1: add login form",
          authorName: "Henry",
          authoredAt: "2026-11-04T09:00:00Z",
          url: "https://github.com/nexus-test-org/nexus-pilot-app/commit/aaaa",
        },
      ],
    });
  });

  it("ignores tag pushes", () => {
    expect(
      normalizeEvent("push", { ref: "refs/tags/v1", after: sha("b"), repository, installation }),
    ).toEqual({ kind: "ignored", reason: "tag push" });
  });

  it("reads a merged pull request", () => {
    const event = normalizeEvent("pull_request", {
      action: "closed",
      number: 7,
      repository,
      installation,
      pull_request: {
        number: 7,
        title: "NX-1 login form",
        state: "closed",
        merged: true,
        html_url: "https://github.com/nexus-test-org/nexus-pilot-app/pull/7",
        updated_at: "2026-11-04T10:00:00Z",
        head: { ref: "task/NX-1-login", sha: sha("c") },
        base: { ref: "main" },
      },
    });
    expect(event).toMatchObject({
      kind: "pull_request",
      action: "closed",
      pr: { number: 7, state: "merged" },
    });
  });

  it.each([
    [{ status: "in_progress", conclusion: null }, "pending"],
    [{ status: "completed", conclusion: "success" }, "success"],
    [{ status: "completed", conclusion: "skipped" }, "success"],
    [{ status: "completed", conclusion: "failure" }, "failure"],
    [{ status: "completed", conclusion: "timed_out" }, "failure"],
  ])("summarises a check suite %j as %s", (suite, checks) => {
    expect(
      normalizeEvent("check_suite", {
        action: "completed",
        repository,
        installation,
        check_suite: { head_sha: sha("d"), ...suite },
      }),
    ).toMatchObject({ kind: "checks", headSha: sha("d"), checks });
  });

  it("reads installation changes", () => {
    expect(
      normalizeEvent("installation", {
        action: "suspend",
        installation: {
          id: 4242,
          account: { login: "nexus-test-org" },
          permissions: { contents: "write" },
        },
      }),
    ).toEqual({
      kind: "installation",
      installationId: 4242,
      action: "suspend",
      accountLogin: "nexus-test-org",
      permissions: { contents: "write" },
    });
  });

  it("ignores events Nexus doesn't use", () => {
    expect(normalizeEvent("ping", { zen: "hi" })).toMatchObject({ kind: "ignored" });
    expect(normalizeEvent("star", {})).toMatchObject({ kind: "ignored" });
  });

  it("throws on a malformed payload, so the delivery is retried and can end in the dead-letter view", () => {
    expect(() => normalizeEvent("push", { ref: "refs/heads/main", repository })).toThrow();
    expect(() =>
      normalizeEvent("pull_request", {
        action: "opened",
        repository,
        pull_request: { number: "x" },
      }),
    ).toThrow();
  });
});
