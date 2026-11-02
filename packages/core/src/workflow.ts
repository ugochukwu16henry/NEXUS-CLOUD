/**
 * Task workflow states from the blueprint (section 5, "Workflow states").
 * The full state machine with approval gates is implemented in Sprint 2; Sprint 0 fixes the vocabulary.
 */
export const WORKFLOW_STATES = [
  "backlog",
  "ready",
  "in_progress",
  "agent_complete",
  "automated_checks",
  "needs_human_review",
  "approved",
  "preview_ready",
  "client_review",
  "release_approved",
  "deployed",
  "verified",
  "closed",
] as const;

export const BLOCKED_STATE = "blocked" as const;

export type HappyPathState = (typeof WORKFLOW_STATES)[number];
export type WorkflowState = HappyPathState | typeof BLOCKED_STATE;

export const STATE_LABELS: Record<WorkflowState, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  agent_complete: "Agent Complete",
  automated_checks: "Automated Checks",
  needs_human_review: "Needs Human Review",
  approved: "Approved",
  preview_ready: "Preview Ready",
  client_review: "Client Review",
  release_approved: "Release Approved",
  deployed: "Deployed",
  verified: "Verified",
  closed: "Closed",
  blocked: "Blocked / Needs Review",
};

/** States that only the owner may move a task into (human approval at risk boundaries). */
export const APPROVAL_GATED_STATES: ReadonlySet<WorkflowState> = new Set([
  "approved",
  "release_approved",
]);

/**
 * Forward moves go one step at a time. Any active state may become blocked, and a blocked task
 * returns to in_progress once the blocker is resolved.
 */
export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return false;
  if (to === BLOCKED_STATE) return from !== "closed";
  if (from === BLOCKED_STATE) return to === "in_progress";
  return WORKFLOW_STATES.indexOf(to) === WORKFLOW_STATES.indexOf(from) + 1;
}
