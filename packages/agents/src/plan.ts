export type PlanTask = {
  id: string;
  title: string;
  dependsOn: string[];
  risks: string[];
  acceptance: string[];
};

export type PlanResult = { ok: true; tasks: PlanTask[] } | { ok: false; reason: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function hasCycle(tasks: PlanTask[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const state = new Map<string, "open" | "done">();
  function walk(id: string): boolean {
    const mark = state.get(id);
    if (mark === "open") return true;
    if (mark === "done") return false;
    state.set(id, "open");
    for (const next of byId.get(id)?.dependsOn ?? []) {
      if (walk(next)) return true;
    }
    state.set(id, "done");
    return false;
  }
  return tasks.some((task) => walk(task.id));
}

/** Planner output: a task graph with dependencies, risks and acceptance criteria. */
export function parsePlan(raw: string): PlanResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "plan is not JSON" };
  }
  if (!parsed || typeof parsed !== "object" || !("tasks" in parsed)) {
    return { ok: false, reason: "plan needs a tasks array" };
  }
  const tasksRaw = (parsed as { tasks: unknown }).tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    return { ok: false, reason: "plan needs at least one task" };
  }
  const tasks: PlanTask[] = [];
  for (const item of tasksRaw) {
    if (!item || typeof item !== "object") return { ok: false, reason: "a task is not an object" };
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string" || !row.title.trim()) {
      return { ok: false, reason: "each task needs an id and a title" };
    }
    if (!isStringArray(row.acceptance) || !isStringArray(row.risks)) {
      return { ok: false, reason: "each task needs risks and acceptance criteria" };
    }
    const dependsOn = row.dependsOn ?? [];
    if (!Array.isArray(dependsOn) || dependsOn.some((id) => typeof id !== "string")) {
      return { ok: false, reason: "dependsOn must be a list of task ids" };
    }
    tasks.push({
      id: row.id,
      title: row.title.trim(),
      dependsOn: dependsOn as string[],
      risks: row.risks,
      acceptance: row.acceptance,
    });
  }
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) return { ok: false, reason: "task ids must be unique" };
  if (tasks.some((task) => task.dependsOn.some((id) => !ids.has(id)))) {
    return { ok: false, reason: "a task depends on an unknown id" };
  }
  if (hasCycle(tasks)) return { ok: false, reason: "the task graph has a cycle" };
  return { ok: true, tasks };
}
