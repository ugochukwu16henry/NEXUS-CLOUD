import { describe, expect, it } from "vitest";
import {
  BLOCKED_STATE,
  WORKFLOW_STATES,
  checkTransition,
  createsDependencyCycle,
  nextStates,
  transitionKind,
  type WorkflowState,
} from "./workflow";

describe("nextStates", () => {
  it("offers the next step and Blocked for an open task", () => {
    expect(nextStates("ready")).toEqual(["in_progress", "blocked"]);
  });

  it("offers only In Progress for a blocked task", () => {
    expect(nextStates("blocked")).toEqual(["in_progress"]);
  });

  it("offers nothing for a closed task", () => {
    expect(nextStates("closed")).toEqual([]);
  });

  it("is consistent with checkTransition for every pair", () => {
    const all: WorkflowState[] = [...WORKFLOW_STATES, BLOCKED_STATE];
    for (const from of all) {
      for (const to of all) {
        const allowed = nextStates(from).includes(to);
        const check = checkTransition({ from, to, dependencyStates: [], blockedReason: "x" });
        expect(check.ok, `${from} → ${to}`).toBe(allowed);
      }
    }
  });
});

describe("transitionKind", () => {
  it("needs approval only for the approval gates", () => {
    expect(transitionKind("approved")).toBe("approve");
    expect(transitionKind("release_approved")).toBe("approve");
    expect(transitionKind("in_progress")).toBe("write");
    expect(transitionKind("blocked")).toBe("write");
  });
});

// Regression scenarios for the board (test plan Sprint 2: "seed suite of 20 known-good board
// scenarios"). Each row is one move with its expected outcome.
const SCENARIOS: [string, Parameters<typeof checkTransition>[0], true | string][] = [
  [
    "start work with no dependencies",
    { from: "ready", to: "in_progress", dependencyStates: [] },
    true,
  ],
  [
    "start work with all dependencies verified",
    { from: "ready", to: "in_progress", dependencyStates: ["verified", "closed"] },
    true,
  ],
  [
    "start work with an open dependency",
    { from: "ready", to: "in_progress", dependencyStates: ["verified", "approved"] },
    "dependencies_open",
  ],
  [
    "start work with a blocked dependency",
    { from: "ready", to: "in_progress", dependencyStates: ["blocked"] },
    "dependencies_open",
  ],
  ["groom backlog to ready", { from: "backlog", to: "ready", dependencyStates: ["backlog"] }, true],
  [
    "skip from backlog to deployed",
    { from: "backlog", to: "deployed", dependencyStates: [] },
    "invalid_transition",
  ],
  [
    "skip review straight to approved",
    { from: "automated_checks", to: "approved", dependencyStates: [] },
    "invalid_transition",
  ],
  [
    "move backwards from review",
    { from: "needs_human_review", to: "in_progress", dependencyStates: [] },
    "invalid_transition",
  ],
  ["agent finishes", { from: "in_progress", to: "agent_complete", dependencyStates: [] }, true],
  [
    "checks pass to human review",
    { from: "automated_checks", to: "needs_human_review", dependencyStates: [] },
    true,
  ],
  [
    "owner approves after review",
    { from: "needs_human_review", to: "approved", dependencyStates: [] },
    true,
  ],
  ["approved to preview", { from: "approved", to: "preview_ready", dependencyStates: [] }, true],
  [
    "client review to release approval",
    { from: "client_review", to: "release_approved", dependencyStates: [] },
    true,
  ],
  ["verified to closed", { from: "verified", to: "closed", dependencyStates: [] }, true],
  [
    "block with a reason",
    { from: "automated_checks", to: "blocked", dependencyStates: [], blockedReason: "Tests fail" },
    true,
  ],
  [
    "block without a reason",
    { from: "automated_checks", to: "blocked", dependencyStates: [], blockedReason: "  " },
    "blocked_reason_required",
  ],
  [
    "block a closed task",
    { from: "closed", to: "blocked", dependencyStates: [], blockedReason: "x" },
    "invalid_transition",
  ],
  [
    "unblock back to in progress",
    { from: "blocked", to: "in_progress", dependencyStates: [] },
    true,
  ],
  [
    "unblock while a dependency is still open",
    { from: "blocked", to: "in_progress", dependencyStates: ["ready"] },
    "dependencies_open",
  ],
  [
    "unblock straight to approved",
    { from: "blocked", to: "approved", dependencyStates: [] },
    "invalid_transition",
  ],
];

describe("board regression scenarios", () => {
  it("has 20 scenarios", () => expect(SCENARIOS).toHaveLength(20));

  for (const [name, input, expected] of SCENARIOS) {
    it(name, () => {
      const result = checkTransition(input);
      if (expected === true) expect(result).toEqual({ ok: true });
      else expect(result).toMatchObject({ ok: false, reason: expected });
    });
  }
});

describe("createsDependencyCycle", () => {
  const edges = [
    { taskId: "B", dependsOnId: "A" },
    { taskId: "C", dependsOnId: "B" },
  ];

  it("rejects a task depending on itself", () => {
    expect(createsDependencyCycle([], "A", "A")).toBe(true);
  });

  it("rejects a direct cycle", () => {
    expect(createsDependencyCycle(edges, "A", "B")).toBe(true);
  });

  it("rejects an indirect cycle", () => {
    expect(createsDependencyCycle(edges, "A", "C")).toBe(true);
  });

  it("allows a new branch", () => {
    expect(createsDependencyCycle(edges, "D", "C")).toBe(false);
    expect(createsDependencyCycle(edges, "C", "A")).toBe(false);
  });
});
