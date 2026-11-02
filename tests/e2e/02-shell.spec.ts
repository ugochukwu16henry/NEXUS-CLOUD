import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test.describe("app shell", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("shows the cockpit panels and the owner's workspace", async ({ page }) => {
    await expect(page.getByText("Nexus Cloud", { exact: true })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("region", { name: "Console" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "AI command panel" })).toBeVisible();
    await expect(page.getByText("MFA off")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("keyboard shortcuts toggle panels", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await page.keyboard.press("Control+b");
    await expect(nav).toBeHidden();
    await page.keyboard.press("Control+b");
    await expect(nav).toBeVisible();

    const consoleRegion = page.getByRole("region", { name: "Console" });
    await page.keyboard.press("Control+j");
    await expect(consoleRegion).toBeHidden();
    await page.keyboard.press("Control+j");
    await expect(consoleRegion).toBeVisible();

    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("panels resize from the keyboard", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    const before = (await nav.boundingBox())!.width;
    await page.getByRole("separator", { name: "Resize navigation" }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(before);
  });

  test("workspace tabs follow the ARIA tabs pattern", async ({ page }) => {
    await page.getByRole("tab", { name: "Diff" }).focus();
    await page.keyboard.press("ArrowRight");
    const board = page.getByRole("tab", { name: "Workflow board" });
    await expect(board).toBeFocused();
    await expect(board).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("list", { name: "Workflow board" })).toBeVisible();
  });

  test("settings, security and audit pages are accessible", async ({ page }) => {
    for (const [path, heading] of [
      ["/settings", "Settings"],
      ["/settings/security", "Two-factor authentication"],
      ["/audit", "Audit log"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    }
  });

  test("display name can be changed and is shown in the header", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Display name").fill("Henry");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile saved.");
    await expect(page.getByRole("banner")).toContainText("Henry");
  });
});
