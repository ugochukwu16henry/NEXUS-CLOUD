import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";
import { testEnv } from "./support/env";

// Non-functional targets from the test plan (Sprint 2): a board with 500 tasks renders in under
// 1.5 s, and list pages answer in under 300 ms at p95. The plan sets these targets for staging, so
// they are enforced exactly with PERF_STRICT=1 (docs/runbooks/staging.md). On developer machines and
// shared CI runners timings swing widely, so there the test fails only on a clear regression (more
// than twice the target) and always records the measured numbers.

const TASK_COUNT = 500;
const STRICT = process.env.PERF_STRICT === "1";
const SLACK = STRICT ? 1 : 2;
const BOARD_BUDGET_MS = 1_500;
const LIST_P95_BUDGET_MS = 300;

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

let projectId = "";

test.describe("performance", () => {
  test.beforeAll(async () => {
    const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
      auth: { persistSession: false },
    });
    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("workspace_id")
      .eq("role", "owner")
      .single();
    if (membershipError) throw membershipError;

    const { data: project, error } = await admin
      .from("projects")
      .insert({ workspace_id: membership.workspace_id, name: "Load test (500 tasks)" })
      .select("id")
      .single();
    if (error) throw error;
    projectId = project.id;

    const states = ["backlog", "ready"] as const;
    const rows = Array.from({ length: TASK_COUNT }, (_, i) => ({
      project_id: projectId,
      title: `Load task ${i + 1}`,
      state: states[i % 2],
      assignee: i % 3 ? "Coding agent" : "Henry",
    }));
    // Inserted in batches: each insert takes the next task number from the project row.
    for (let i = 0; i < rows.length; i += 100) {
      const { error: insertError } = await admin.from("tasks").insert(rows.slice(i, i + 100));
      if (insertError) throw insertError;
    }
  });

  test(`board with ${TASK_COUNT} tasks renders within ${BOARD_BUDGET_MS} ms`, async ({ page }) => {
    await signIn(page);
    // Warm the route once so the measurement is not dominated by first-request compilation.
    await page.goto(`/projects/${projectId}/board`);

    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      await page.goto(`/projects/${projectId}/board`);
      // Columns cap at 50 cards; the "show all" link proves the full count was loaded and paged.
      await expect(page.getByRole("link", { name: "Show all 250 in Backlog" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Show all 250 in Ready" })).toBeVisible();
      runs.push(Date.now() - started);
    }
    const elapsed = median(runs);

    test.info().annotations.push({
      type: "board-render-ms",
      description: `median ${elapsed} of ${runs.join(", ")}`,
    });
    console.log(
      `board with ${TASK_COUNT} tasks rendered in ${elapsed} ms (median of ${runs.join(", ")})`,
    );
    expect(elapsed).toBeLessThan(BOARD_BUDGET_MS * SLACK);

    // Expanding a column shows every card in it.
    await page.getByRole("link", { name: "Show all 250 in Backlog" }).click();
    await expect(
      page.getByRole("list", { name: "Backlog tasks", exact: true }).getByRole("listitem"),
    ).toHaveCount(250);
  });

  test(`list pages answer within ${LIST_P95_BUDGET_MS} ms at p95`, async ({ page }) => {
    await signIn(page);
    const request = page.context().request;
    const samples: number[] = [];
    for (const path of [
      "/projects",
      `/projects/${projectId}/requirements`,
      `/projects/${projectId}/activity`,
    ]) {
      await request.get(path); // warm-up
      for (let i = 0; i < 10; i++) {
        const started = performance.now();
        const response = await request.get(path);
        samples.push(performance.now() - started);
        expect(response.status(), path).toBe(200);
      }
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    console.log(`list pages p95 ${p95.toFixed(0)} ms over ${samples.length} requests`);
    test.info().annotations.push({ type: "list-p95-ms", description: p95.toFixed(0) });
    expect(p95).toBeLessThan(LIST_P95_BUDGET_MS * SLACK);
  });
});
