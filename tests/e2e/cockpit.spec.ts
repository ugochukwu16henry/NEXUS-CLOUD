import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("cockpit prototype", () => {
  test("shows the main panels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("region", { name: "Console" })).toBeVisible();
    await expect(page.getByText("Prototype · sample data")).toBeVisible();
  });

  test("workspace tabs work with the keyboard", async ({ page }) => {
    await page.goto("/");
    const diffTab = page.getByRole("tab", { name: "Diff" });
    await diffTab.focus();
    await page.keyboard.press("ArrowRight");
    const boardTab = page.getByRole("tab", { name: "Workflow board" });
    await expect(boardTab).toBeFocused();
    await expect(boardTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("list", { name: "Workflow board" })).toBeVisible();
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("sends baseline security headers", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  });
});
