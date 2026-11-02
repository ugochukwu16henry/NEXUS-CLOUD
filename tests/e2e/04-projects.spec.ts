import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";

// Sprint 2 journey (test plan): create a project, add a requirement and milestone, create three
// tasks with dependencies, drive them through the workflow, and check the timeline. Steps share
// one project, so they run in order.
test.describe.configure({ mode: "serial" });

let projectUrl = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

function column(page: Page, label: string) {
  return page.getByRole("list", { name: `${label} tasks`, exact: true });
}

/** Moves a task on the board with the keyboard-accessible "Move" control. */
async function move(page: Page, ref: number, stateLabel: string) {
  await page.getByLabel(`Move NX-${ref} to`).selectOption({ label: stateLabel });
  await page.getByRole("button", { name: `Move NX-${ref}`, exact: true }).click();
}

async function moveAndExpect(page: Page, ref: number, stateLabel: string) {
  await move(page, ref, stateLabel);
  await expect(page.getByTestId("announcer")).toHaveText(`NX-${ref} moved to ${stateLabel}.`);
  await expect(column(page, stateLabel).getByText(`NX-${ref}`, { exact: true })).toBeVisible();
}

async function createTask(
  page: Page,
  title: string,
  options: { start?: string; dependsOn?: string[]; milestone?: string } = {},
) {
  await page.goto(`${projectUrl}/tasks/new`);
  await page.getByLabel("Title").fill(title);
  if (options.milestone)
    await page.getByLabel("Milestone").selectOption({ label: options.milestone });
  if (options.start) await page.getByLabel("Start in").selectOption({ label: options.start });
  for (const dependency of options.dependsOn ?? []) await page.getByLabel(dependency).check();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test.describe("project cockpit", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("owner creates a project", async ({ page }) => {
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Name").fill("Pilot app");
    await page.getByLabel("Client").fill("Acme");
    await page.getByLabel("Budget (USD)").fill("200");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    projectUrl = new URL(page.url()).pathname;
    await expect(page.getByText("Pilot app", { exact: true })).toBeVisible();
    await expect(page.getByText("Nothing is waiting on you.")).toBeVisible();
    await expectAccessible(page);
  });

  test("requirements are versioned and approval resets when content changes", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByLabel("Title").fill("Password reset");
    await page.getByLabel("Statement").fill("Users can reset their password");
    await page.getByLabel("Priority").selectOption({ label: "Must" });
    await page.getByRole("button", { name: "Add requirement" }).click();
    await expect(page.getByRole("status").filter({ hasText: "REQ-1 added." })).toBeVisible();

    await page.getByRole("link", { name: "Password reset" }).click();
    await page.getByLabel("Statement").fill("Users can reset their password by email");
    await page.getByRole("button", { name: "Save requirement" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved as version 2." })).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("announcer")).toHaveText("Requirement approved.");
    await page.reload();
    await expect(page.getByText("approved", { exact: true })).toBeVisible();
    await expect(page.getByText("Users can reset their password", { exact: true })).toBeVisible();

    await page.getByLabel("Statement").fill("Users can reset their password by email or SMS");
    await page.getByRole("button", { name: "Save requirement" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved as version 4." })).toBeVisible();
    await page.reload();
    await expect(page.getByText("draft", { exact: true })).toBeVisible();
    await expectAccessible(page);
  });

  test("milestone and three tasks with dependencies", async ({ page }) => {
    await page.goto(`${projectUrl}/milestones`);
    await page.getByLabel("Title").fill("Auth MVP");
    await page.getByRole("button", { name: "Add milestone" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Milestone added." })).toBeVisible();
    await expectAccessible(page);

    await createTask(page, "Token table", { start: "Ready", milestone: "Auth MVP" });
    await createTask(page, "Reset endpoint", { start: "Ready", dependsOn: ["NX-1 Token table"] });
    await createTask(page, "Reset E2E", { dependsOn: ["NX-2 Reset endpoint"] });
    await expect(page.getByRole("link", { name: /NX-2 Reset endpoint/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("the board enforces dependencies, blocking and approval gates", async ({ page }) => {
    test.setTimeout(120_000);
    const secret = await ensureMfa(page);
    // ensureMfa may leave this session verified (aal2); start a fresh aal1 session so the approval
    // gate is exercised.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await signIn(page);
    await page.goto(`${projectUrl}/board`);
    await expectAccessible(page);

    // NX-2 can't start while NX-1 is unfinished.
    await move(page, 2, "In Progress");
    await expect(
      page.getByRole("alert").filter({ hasText: "Finish the tasks this one depends on first" }),
    ).toBeVisible();

    // Blocking needs a reason and shows it on the card.
    await page.getByLabel("Move NX-1 to").selectOption({ label: "Blocked / Needs Review" });
    await page.getByLabel("What is blocking it?").fill("Waiting on schema review");
    await page.getByRole("button", { name: "Move NX-1", exact: true }).click();
    await expect(
      column(page, "Blocked / Needs Review").getByText("Waiting on schema review"),
    ).toBeVisible();

    await moveAndExpect(page, 1, "In Progress");
    await moveAndExpect(page, 1, "Agent Complete");
    await moveAndExpect(page, 1, "Automated Checks");
    await moveAndExpect(page, 1, "Needs Human Review");

    // Approval needs a verified second factor in this session.
    await move(page, 1, "Approved");
    await passMfaChallenge(page, secret);
    await expect(page).toHaveURL(new RegExp(`${projectUrl}/board$`));
    await moveAndExpect(page, 1, "Approved");

    for (const state of [
      "Preview Ready",
      "Client Review",
      "Release Approved",
      "Deployed",
      "Verified",
    ]) {
      await moveAndExpect(page, 1, state);
    }

    // Now that NX-1 is verified, NX-2 can start.
    await moveAndExpect(page, 2, "In Progress");
    await expect(column(page, "Backlog").getByText("Waiting on NX-2")).toBeVisible();
  });

  test("overview, milestone progress and activity timeline reflect the work", async ({ page }) => {
    await page.goto(projectUrl);
    await expect(page.getByText("1/1 done")).toBeVisible();
    await expect(page.getByText("1 of 1 approved")).not.toBeVisible();
    await expect(page.getByText("0 of 1 approved")).toBeVisible();

    await page.goto(`${projectUrl}/milestones`);
    await expect(page.getByText("1 of 1 linked tasks done")).toBeVisible();

    await page.goto(`${projectUrl}/activity`);
    const timeline = page.getByRole("list", { name: "Project activity" });
    await expect(timeline.getByText("created the project")).toBeVisible();
    await expect(
      timeline
        .getByText("(verified → closed)")
        .or(timeline.getByText("(deployed → verified)"))
        .first(),
    ).toBeVisible();
    await expect(timeline.getByText(/denied: dependencies open/).first()).toBeVisible();
    await expect(timeline.getByText(/denied: mfa required/).first()).toBeVisible();
    await expectAccessible(page);
  });

  test("concurrent edits are detected instead of overwritten", async ({ page, context }) => {
    await page.goto(`${projectUrl}/board`);
    await page.getByRole("link", { name: "Reset E2E" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reset E2E" })).toBeVisible();
    const taskUrl = page.url();

    const other = await context.newPage();
    await other.goto(taskUrl);
    await other.getByLabel("Title").fill("Reset E2E journey");
    await other.getByRole("button", { name: "Save task" }).click();
    await expect(other.getByRole("status").filter({ hasText: "Task saved." })).toBeVisible();

    await page.getByLabel("Title").fill("Reset E2E (stale edit)");
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Someone changed this since you opened it" }),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test("dependency cycles are refused", async ({ page }) => {
    await page.goto(`${projectUrl}/board`);
    await page.getByRole("link", { name: "Token table" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Token table" })).toBeVisible();
    await page
      .getByLabel("Add a task this depends on")
      .selectOption({ label: "NX-3 Reset E2E journey" });
    await page.getByRole("button", { name: "Add dependency" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "depend on each other in a loop" }),
    ).toBeVisible();
  });

  test("settings save with the current version and archiving keeps the project", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/settings`);
    await page.getByLabel("Budget (USD)").fill("250");
    await page.getByRole("button", { name: "Save project" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Project saved." })).toBeVisible();
    // A second save straight after works because the form tracks the new version.
    await page.getByLabel("Stack").fill("Next.js, Supabase");
    // Both saves show the same message, so wait for the second server action to finish.
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && response.ok()),
      page.getByRole("button", { name: "Save project" }).click(),
    ]);
    await page.reload();
    await expect(page.getByLabel("Stack")).toHaveValue("Next.js, Supabase");
    await expect(page.getByLabel("Budget (USD)")).toHaveValue("250");

    await page.getByRole("button", { name: "Archive project" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Project archived." })).toBeVisible();
    await page.goto("/projects");
    await expect(page.getByRole("row", { name: /Pilot app/ }).getByText("Archived")).toBeVisible();
  });
});
