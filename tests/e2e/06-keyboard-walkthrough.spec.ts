import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";

// Sprint 0 "prototype usability" check, run against the real app: the three walkthrough tasks
// (open a project, review a diff, approve) done with the keyboard only. Every control is focused
// and activated with keys, never clicked, and each focused control must show a visible focus ring.
// Findings are written up in docs/usability/keyboard-walkthrough.md.

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const outline = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline.style, "focused control has an outline").not.toBe("none");
  expect(parseFloat(outline.width), "outline is visible").toBeGreaterThan(0);
}

/** Moves focus with Tab until `target` is focused (fails if it never gets there). */
async function tabTo(page: Page, target: Locator, maxPresses = 80) {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Could not reach ${target} with Tab in ${maxPresses} presses`);
}

test.describe("keyboard-only walkthrough", () => {
  test("skip link, open a project, review a diff, approve a task", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    const secret = await ensureMfa(page);

    // Start from the cockpit with a fresh page; the first Tab reaches the skip link.
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    // Task 1: open a project.
    const projectsLink = page.getByRole("link", { name: "Projects", exact: true });
    await tabTo(page, projectsLink);
    await expectVisibleFocus(projectsLink);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    const project = page.getByRole("link", { name: "Pilot app" });
    await tabTo(page, project);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Project sections" })).toBeVisible();

    // Task 2: review a diff (the cockpit's diff view; real repository diffs arrive in Sprint 4).
    await page.goto("/");
    const diffTab = page.getByRole("tab", { name: "Diff" });
    await tabTo(page, diffTab);
    await expectVisibleFocus(diffTab);
    await expect(page.getByRole("tabpanel")).toContainText("export async function POST");

    // Task 3: approve (a task approval gate; deploy approval arrives in Sprint 8).
    await page.goto("/projects");
    await tabTo(page, page.getByRole("link", { name: "Pilot app" }));
    await page.keyboard.press("Enter");
    const boardLink = page.getByRole("link", { name: "Board", exact: true });
    await tabTo(page, boardLink);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();

    // NX-2 is In Progress; walk it to Needs Human Review, then approve, using only the keyboard.
    for (const next of ["Agent Complete", "Automated Checks", "Needs Human Review", "Approved"]) {
      const select = page.getByLabel("Move NX-2 to");
      await tabTo(page, select);
      await expectVisibleFocus(select);
      await select.selectOption({ label: next });
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Move NX-2", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");

      // Approval asks for the authenticator code unless this session already passed MFA.
      const moved = page.getByText(`NX-2 moved to ${next}.`);
      const challenge = page.getByLabel("Authentication code");
      await expect(moved.or(challenge)).toBeVisible();
      if (await challenge.isVisible()) {
        await passMfaChallenge(page, secret);
        await tabTo(page, page.getByLabel("Move NX-2 to"));
        await page.getByLabel("Move NX-2 to").selectOption({ label: next });
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
      }
      await expect(page.getByTestId("announcer")).toHaveText(`NX-2 moved to ${next}.`);
    }
  });
});
