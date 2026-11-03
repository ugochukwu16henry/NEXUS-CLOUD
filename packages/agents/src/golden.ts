import type { PlanTask } from "./plan";

/** Fifteen small requests. Live scores are not recorded until a model is funded. */

export type GoldenRequest = {
  id: string;
  request: string;
  allowedPaths: string[];
};

export const GOLDEN_REQUESTS: readonly GoldenRequest[] = [
  {
    id: "G01",
    request: "Add a login form with email and password fields.",
    allowedPaths: ["src/login.tsx"],
  },
  {
    id: "G02",
    request: "Show a friendly empty state when the task list is empty.",
    allowedPaths: ["src/tasks.tsx"],
  },
  {
    id: "G03",
    request: "Validate the project name is 1 to 80 characters.",
    allowedPaths: ["src/project.ts"],
  },
  {
    id: "G04",
    request: "Add a button that copies the preview URL.",
    allowedPaths: ["src/preview.tsx"],
  },
  {
    id: "G05",
    request: "Format dates in the activity list as day month year.",
    allowedPaths: ["src/activity.tsx"],
  },
  { id: "G06", request: "Reject a budget that is negative.", allowedPaths: ["src/budget.ts"] },
  { id: "G07", request: "Add a skip link to the main content.", allowedPaths: ["src/shell.tsx"] },
  {
    id: "G08",
    request: "Persist the selected task in the page query string.",
    allowedPaths: ["src/board.tsx"],
  },
  {
    id: "G09",
    request: "Show the branch name next to the commit button.",
    allowedPaths: ["src/commit.tsx"],
  },
  {
    id: "G10",
    request: "Limit the upload list to the configured file count.",
    allowedPaths: ["src/upload.ts"],
  },
  {
    id: "G11",
    request: "Add a test that a closed task cannot be blocked.",
    allowedPaths: ["src/workflow.test.ts"],
  },
  { id: "G12", request: "Redact tokens in the command log.", allowedPaths: ["src/redact.ts"] },
  {
    id: "G13",
    request: "Disable the save button while a save is in flight.",
    allowedPaths: ["src/editor.tsx"],
  },
  { id: "G14", request: "Sort milestones by due date.", allowedPaths: ["src/milestones.ts"] },
  {
    id: "G15",
    request: "Explain a failed typecheck in one sentence.",
    allowedPaths: ["src/checks.ts"],
  },
];

export type PlanScore = { score: number; notes: string[] };

/** Rubric for a plan. 100 means tasks, acceptance, risks, an acyclic graph, and paths inside scope. */
export function scorePlan(tasks: readonly PlanTask[], allowedPaths: readonly string[]): PlanScore {
  const notes: string[] = [];
  let score = 0;
  if (tasks.length > 0) score += 20;
  else notes.push("no tasks");
  if (tasks.every((task) => task.acceptance.length > 0)) score += 20;
  else notes.push("missing acceptance criteria");
  if (tasks.every((task) => task.risks.length > 0)) score += 20;
  else notes.push("missing risks");
  const ids = new Set(tasks.map((task) => task.id));
  const cyclic = tasks.some((task) => task.dependsOn.includes(task.id));
  const unknown = tasks.some((task) => task.dependsOn.some((id) => !ids.has(id)));
  if (!cyclic && !unknown) score += 20;
  else notes.push("dependencies are not usable");
  const mentioned = tasks.flatMap((task) =>
    `${task.title} ${task.acceptance.join(" ")}`.split(/\s+/),
  );
  const outside = mentioned.filter((word) => word.includes("/") && !allowedPaths.includes(word));
  if (outside.length === 0) score += 20;
  else notes.push("touches a path outside the request");
  return { score, notes };
}

/** The live baseline is deliberately unrecorded. Fixture plans exercise the rubric only. */
export const BASELINE = {
  recorded: false,
  target: 0.7,
  reason:
    "The golden set has not been run against a live model. No provider account is funded, so there is no acceptance rate to publish.",
} as const;
