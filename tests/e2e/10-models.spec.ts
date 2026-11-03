import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";

// Sprint 5: a tiny project budget warns at 50%, stops at 100%, and continues after the owner
// lifts the stop. The model is the local recorded reply (NEXUS_MODEL_FIXTURE), so this spends nothing.
test.describe.configure({ mode: "serial" });

let projectUrl = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

test.describe("model budget", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("owner sets a tiny model budget", async ({ page }) => {
    await page.goto("/projects");
    await page.getByLabel("Name").fill("Budget pilot");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    projectUrl = new URL(page.url()).pathname;

    await page.goto(`${projectUrl}/settings`);
    await page.getByLabel("Project budget (USD / month)").fill("0.02");
    await page.getByRole("button", { name: "Save model settings" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Model settings saved." }),
    ).toBeVisible();
  });

  test("a prompt warns, then the next one stops, then a lifted stop lets it through", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/assistant`);
    await expect(page.getByRole("heading", { level: 1, name: "Assistant" })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Prompt").fill("hello");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recorded reply from" })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Warning: 50% of the project budget." }),
    ).toBeVisible();

    // The form clears after each answer.
    await page.getByLabel("Prompt").fill("hello once more");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Stopped: the project budget is used up." }),
    ).toBeVisible();

    const secret = await ensureMfa(page);
    await page.goto(`${projectUrl}/assistant`);
    await page.getByRole("button", { name: "Lift the project stop for 24 hours" }).click();
    // Either the second-factor challenge or the result appears; wait for one before deciding
    // (the URL already contains "assistant", so waiting on the URL would return at once).
    const challenge = page.getByLabel("Authentication code");
    const lifted = page.getByRole("status").filter({ hasText: "Project stop lifted" });
    await expect(challenge.or(lifted)).toBeVisible();
    if (await challenge.isVisible()) {
      await passMfaChallenge(page, secret);
      await page.getByRole("button", { name: "Lift the project stop for 24 hours" }).click();
    }
    await expect(lifted).toBeVisible();

    await page.getByLabel("Prompt").fill("hello again");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recorded reply from" })).toBeVisible();
  });
});

// ADR 0018: a provider's refusal is not a dead end. With fallback on (the default) another provider
// answers; with it off, the message names the alternatives and the owner picks one directly.
test.describe("routing round a declined request", () => {
  let routingUrl = "";

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("another provider answers when one declines, and the owner can pick any model", async ({
    page,
  }) => {
    await page.goto("/projects");
    await page.getByLabel("Name").fill(`Routing pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    routingUrl = new URL(page.url()).pathname;

    await page.goto(`${routingUrl}/assistant`);
    await page.getByLabel("Prompt").fill("fixture: decline this script");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Recorded reply from openai" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Anthropic claude-sonnet-5-5 declined; answered by OpenAI" }),
    ).toBeVisible();

    // Fallback off: the refusal is reported with the providers to try instead.
    await page.goto(`${routingUrl}/settings`);
    await page.getByLabel(/try the next allowed one/).uncheck();
    await page.getByRole("button", { name: "Save model settings" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Model settings saved." }),
    ).toBeVisible();

    await page.goto(`${routingUrl}/assistant`);
    await page.getByLabel("Prompt").fill("fixture: decline this script");
    await page.getByRole("button", { name: "Ask" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "declined this request" });
    await expect(alert).toContainText(
      "Anthropic declined this request under its own usage policy.",
    );
    await expect(alert).toContainText("Try another provider: choose OpenAI");

    // One pick of another model, and it answers directly.
    await page.getByLabel("AI model").selectOption({ label: "OpenAI · GPT-6.1 Sol" });
    await page.getByLabel("Prompt").fill("fixture: decline this script");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Recorded reply from openai" }),
    ).toBeVisible();
    await expectAccessible(page);
  });
});

// Free and open providers: the owner sees which are free, which are a trial, and which keys are
// missing; each project can allow or block them.
test.describe("provider catalog", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Settings → Models marks free, trial and paid providers and missing keys", async ({
    page,
  }) => {
    await page.goto("/settings/models");
    const providers = page.getByRole("list", { name: "Providers" });
    const openrouter = providers
      .getByRole("listitem")
      .filter({ has: page.getByText("OpenRouter", { exact: true }) });
    await expect(openrouter).toContainText("Free tier");
    await expect(openrouter).toContainText("Not set: add OPENROUTER_API_KEY");
    await expect(openrouter).toContainText("free.");
    await expect(
      providers.getByRole("listitem").filter({ has: page.getByText("Cerebras", { exact: true }) }),
    ).toContainText("Free trial");
    await expect(
      providers.getByRole("listitem").filter({ has: page.getByText("Anthropic", { exact: true }) }),
    ).toContainText("Paid");
    await expectAccessible(page);

    await page.goto(`${projectUrl}/settings`);
    const allowed = page.getByRole("group", { name: "Providers allowed" });
    await expect(allowed.getByRole("checkbox", { name: /Cerebras/ })).toBeChecked();
    await expect(allowed.getByText("Free trial")).toBeVisible();
  });
});
