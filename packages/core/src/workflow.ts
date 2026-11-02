/**
 * Task workflow states from the blueprint (section 5, "Workflow states"). The same rules are
 * enforced again by a database trigger (supabase/migrations/*_project_cockpit.sql).
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

/** Every state a task in `from` may move to, in the order a menu should offer them. */
export function nextStates(from: WorkflowState): WorkflowState[] {
  const candidates: WorkflowState[] = [...WORKFLOW_STATES, BLOCKED_STATE];
  return candidates.filter((to) => canTransition(from, to));
}

/** A dependency counts as done once its work is verified in production or closed. */
export const DONE_STATES: ReadonlySet<WorkflowState> = new Set(["verified", "closed"]);

export function isDone(state: WorkflowState): boolean {
  return DONE_STATES.has(state);
}

/** Moving into these states needs the owner's approval permission; everything else is a normal edit. */
export function transitionKind(to: WorkflowState): "approve" | "write" {
  return APPROVAL_GATED_STATES.has(to) ? "approve" : "write";
}

export type TransitionInput = {
  from: WorkflowState;
  to: WorkflowState;
  /** States of the tasks this task depends on. */
  dependencyStates: readonly WorkflowState[];
  blockedReason?: string | null;
};

export type TransitionCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_transition" | "dependencies_open" | "blocked_reason_required";
      message: string;
    };

/**
 * Full transition rule: the step must be allowed, work can't start (enter In Progress) until every
 * dependency is done, and blocking a task needs a reason so the blocker is never hidden.
 */
export function checkTransition({
  from,
  to,
  dependencyStates,
  blockedReason,
}: TransitionInput): TransitionCheck {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: "invalid_transition",
      message: `A task can't move from ${STATE_LABELS[from]} to ${STATE_LABELS[to]}.`,
    };
  }
  if (to === "in_progress" && dependencyStates.some((state) => !isDone(state))) {
    return {
      ok: false,
      reason: "dependencies_open",
      message: "Finish the tasks this one depends on first (they must be Verified or Closed).",
    };
  }
  if (to === BLOCKED_STATE && !blockedReason?.trim()) {
    return {
      ok: false,
      reason: "blocked_reason_required",
      message: "Say what is blocking the task.",
    };
  }
  return { ok: true };
}

/**
 * Would adding "task depends on dependsOn" create a cycle? True when dependsOn already depends,
 * directly or indirectly, on task (or they are the same task).
 */
export function createsDependencyCycle(
  edges: ReadonlyArray<{ taskId: string; dependsOnId: string }>,
  taskId: string,
  dependsOnId: string,
): boolean {
  if (taskId === dependsOnId) return true;
  const dependsOn = new Map<string, string[]>();
  for (const edge of edges) {
    dependsOn.set(edge.taskId, [...(dependsOn.get(edge.taskId) ?? []), edge.dependsOnId]);
  }
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(dependsOn.get(current) ?? []));
  }
  return false;
}
