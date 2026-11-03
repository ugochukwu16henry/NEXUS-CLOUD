import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";
import { testEnv } from "./support/env";

// Sprint 6 journey: the worker plans a task, the owner approves, the coder edits the task's files
// in a sandbox, a command off the safe list waits for the owner, and the diff lands in the change
// set. The terminal opens on the same files. Models and the sandbox are the recorded ones
// (NEXUS_AGENT_FIXTURE, NEXUS_SANDBOX_DRIVER=recorded), so nothing is spent or executed.
test.describe.configure({ mode: "serial" });
test.skip(!!process.env.E2E_BASE_URL, "needs the local fake GitHub and worker");

const FAKE = "http://localhost:3299";
const REPO = "nexus-test-org/nexus-pilot-app";
let projectUrl = "";
let taskId = "";
let secret = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

/** Clicks a button that needs the authenticator, passing the challenge if it appears. */
async function clickWithMfa(page: Page, button: Locator, done: Locator) {
  await button.click();
  const challenge = page.getByLabel("Authentication code");
  // The panel picks up the worker's progress on its next refresh.
  await expect(challenge.or(done)).toBeVisible({ timeout: 30_000 });
  if (await challenge.isVisible()) {
    await passMfaChallenge(page, secret);
    await button.click();
  }
  await expect(done).toBeVisible({ timeout: 30_000 });
}

test.describe("agent runs", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${FAKE}/_fake/reset`);
    // The fake has one repository; free it from earlier specs so this one can import it.
    const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
      auth: { persistSession: false },
    });
    await admin.from("repositories").delete().eq("full_name", REPO);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("plan, approve, a command approval, and the diff in the change set", async ({ page }) => {
    test.setTimeout(180_000);
    secret = await ensureMfa(page);

    await page.goto("/settings/integrations");
    const connect = page.getByRole("button", { name: "Connect GitHub" });
    if (await connect.isVisible()) {
      await connect.click();
      await page.waitForURL(/\/mfa\?|notice=connected/);
      if (page.url().includes("/mfa")) {
        await passMfaChallenge(page, secret);
        await page.getByRole("button", { name: "Connect GitHub" }).click();
      }
      await expect(page).toHaveURL(/notice=connected/);
    }

    await page.goto("/projects");
    await page.getByLabel("Name").fill(`Agent pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    projectUrl = new URL(page.url()).pathname;
    await page.goto(`${projectUrl}/tasks/new`);
    await page.getByLabel("Title").fill("Farewell helper");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Farewell helper" })).toBeVisible();
    taskId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto(`${projectUrl}/repository`);
    await page.getByLabel("Repository").selectOption({ label: `${REPO} (private)` });
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByRole("heading", { level: 1, name: REPO })).toBeVisible();
    await page.goto(`${projectUrl}/code?task=${taskId}`);
    await page.getByRole("button", { name: /Edit this task|Start a branch for this task/ }).click();
    await expect(page.getByRole("heading", { name: /Changes/ })).toBeVisible();

    const taskUrl = `${projectUrl}/tasks/${taskId}`;
    await page.goto(taskUrl);
    await page.getByLabel("What should the agent do?").fill("Add a farewell helper next to greet");
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    const activity = page.getByRole("list", { name: "Agent activity" });
    // The panel refreshes itself while the worker has the run.
    await expect(activity).toContainText("Add a farewell helper", { timeout: 30_000 });
    await expectAccessible(page);

    await clickWithMfa(
      page,
      page.getByRole("button", { name: "Approve plan" }),
      page.getByText("Waiting for approval: node scripts/check.mjs").first(),
    );
    await expect(activity).toContainText("pnpm test — exit 0");
    await expect(activity).toContainText("Wrote src/index.ts");
    await expectAccessible(page);

    await page.getByRole("button", { name: "Approve command" }).click();
    await expect(activity).toContainText("Added farewell next to greet.", { timeout: 30_000 });
    await expect(activity).toContainText("node scripts/check.mjs — exit 0");
    await expect(page.getByText(/Latest run \(coder\):\s*succeeded/)).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`${projectUrl}/code?task=${taskId}`);
    const changed = page.getByRole("list", { name: "Changed files" });
    await expect(changed).toContainText("src/index.ts");
    await changed.getByRole("link", { name: "src/index.ts" }).click();
    await expect(page.getByRole("region", { name: "Changes to src/index.ts" })).toContainText(
      "Goodbye",
    );
  });

  test("the terminal opens on the task's files", async ({ page }) => {
    secret = await ensureMfa(page);
    await page.goto(`${projectUrl}/code?task=${taskId}`);
    const terminal = page.locator(".xterm-rows");
    await clickWithMfa(
      page,
      page.getByRole("button", { name: "Open terminal" }),
      page.getByRole("status").filter({ hasText: "Terminal ticket issued" }),
    );
    await expect(terminal).toContainText("recorded shell", { timeout: 30_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("ls\n");
    await expect(terminal).toContainText("src/index.ts");
  });

  test("a new plan can be cancelled", async ({ page }) => {
    await page.goto(`${projectUrl}/tasks/${taskId}`);
    await page.getByLabel("What should the agent do?").fill("Another change");
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel run" }).click();
    await expect(page.getByTestId("announcer")).toHaveText("Run cancelled.");
  });
});
