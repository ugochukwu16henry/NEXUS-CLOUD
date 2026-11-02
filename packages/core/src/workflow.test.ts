import { describe, expect, it } from "vitest";
import {
  APPROVAL_GATED_STATES,
  BLOCKED_STATE,
  STATE_LABELS,
  WORKFLOW_STATES,
  canTransition,
} from "./workflow";

describe("workflow states", () => {
  it("follows the blueprint order from backlog to closed", () => {
    expect(WORKFLOW_STATES[0]).toBe("backlog");
    expect(WORKFLOW_STATES.at(-1)).toBe("closed");
    expect(WORKFLOW_STATES).toHaveLength(13);
  });

  it("has a label for every state", () => {
    for (const state of [...WORKFLOW_STATES, BLOCKED_STATE]) {
      expect(STATE_LABELS[state]).toBeTruthy();
    }
  });

  it("gates approval states", () => {
    expect(APPROVAL_GATED_STATES.has("approved")).toBe(true);
    expect(APPROVAL_GATED_STATES.has("release_approved")).toBe(true);
    expect(APPROVAL_GATED_STATES.has("in_progress")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows each single forward step", () => {
    for (let i = 0; i < WORKFLOW_STATES.length - 1; i++) {
      expect(canTransition(WORKFLOW_STATES[i]!, WORKFLOW_STATES[i + 1]!)).toBe(true);
    }
  });

  it("rejects skipping states", () => {
    expect(canTransition("backlog", "deployed")).toBe(false);
    expect(canTransition("in_progress", "approved")).toBe(false);
  });

  it("rejects moving backwards or staying put", () => {
    expect(canTransition("deployed", "backlog")).toBe(false);
    expect(canTransition("ready", "ready")).toBe(false);
  });

  it("lets any open task become blocked, and blocked return to in progress only", () => {
    expect(canTransition("automated_checks", "blocked")).toBe(true);
    expect(canTransition("closed", "blocked")).toBe(false);
    expect(canTransition("blocked", "in_progress")).toBe(true);
    expect(canTransition("blocked", "approved")).toBe(false);
  });
});

// CI gate proof (docs/evidence/ci-gate-proof.md): this branch must go red. Never merge it.
describe("deliberately failing test", () => {
  it("fails on purpose", () => {
    expect(1 + 1).toBe(3);
  });
});
