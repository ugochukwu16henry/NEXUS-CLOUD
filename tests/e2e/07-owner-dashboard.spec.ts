import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";

// Harmonization sprint (ADR 0015): one sign-in reaches both the Business area (Nexus AI Hub's
// Owner Dashboard) and the Engineering area (the agent cockpit), and the Business area asks for
// two-step verification before it shows customer or revenue data.

test.describe("owner dashboard", () => {
  test("owner moves between Business and Engineering with one sign-in", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    const secret = await ensureMfa(page);

    await page.goto("/");
    const business = page.getByRole("list", { name: "Business" });
    await expect(page.getByRole("list", { name: "Engineering" })).toBeVisible();
    await business.getByRole("link", { name: "Owner dashboard" }).click();

    // Customer and revenue data need MFA in this session. Wait for the page before deciding.
    await expect(page.getByRole("heading", { level: 1, name: "Owner dashboard" })).toBeVisible();
    const verify = page.getByRole("link", { name: "Verify it's you" });
    if (await verify.isVisible()) {
      await verify.click();
      await passMfaChallenge(page, secret);
    }
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole("heading", { level: 1, name: "Owner dashboard" })).toBeVisible();
    await expect(page.getByText("Sample data until Hub Sprint 5")).toBeVisible();

    // The margin guard is computed with @nexus/money from the Hub's launch prices.
    const margins = page.getByRole("table");
    await expect(margins.getByRole("row", { name: /Video Standard · 5 s/ })).toContainText("57%");
    await expect(margins.getByRole("row", { name: /Student question/ })).toContainText("89%");

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => `${v.id}: ${v.help}`),
    ).toEqual([]);

    // "Developer agent" leads staff to the agent cockpit.
    await page.getByRole("link", { name: "Open the agent dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  });
});
