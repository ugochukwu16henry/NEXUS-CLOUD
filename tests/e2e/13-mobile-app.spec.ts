import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";

// The installable app (PWA) and the phone layout: the manifest, icons, service worker and
// offline page load without a session; on a phone-sized screen the shell has a bottom tab bar and
// a menu holding sign-out and install, and no page scrolls sideways.
test.describe("installable app", () => {
  test("manifest, icons, service worker and offline page are served to anyone", async ({
    request,
  }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const body = (await manifest.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(body).toMatchObject({ name: "Nexus Cloud", short_name: "Nexus", display: "standalone" });
    expect(body.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(body.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of body.icons) {
      const image = await request.get(icon.src);
      expect(image.ok()).toBe(true);
      expect(image.headers()["content-type"]).toContain("image/png");
    }

    const worker = await request.get("/sw.js");
    expect(worker.ok()).toBe(true);
    expect(worker.headers()["content-type"]).toContain("javascript");
    const offline = await request.get("/offline.html");
    expect(await offline.text()).toContain("You're offline");
  });

  test("the service worker registers and the CSP allows it", async ({ page }) => {
    await signIn(page);
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.scope;
    });
    expect(new URL(scope).pathname).toBe("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function noSidewaysScroll(page: Page) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  test("tab bar, menu with sign-out and install, and pages that fit the screen", async ({
    page,
  }) => {
    await signIn(page);
    const tabs = page.getByRole("navigation", { name: "Quick links" });
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Agents" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Sign-out and the shortcuts button live in the menu on a phone.
    await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeHidden();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = page.locator("#nav-menu");
    await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expectAccessible(page);
    // Tapping beside the drawer closes it, and so does Escape.
    await page.getByRole("button", { name: "Close menu" }).click({ position: { x: 370, y: 400 } });
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    for (const path of ["/", "/projects", "/agents", "/settings", "/settings/models"]) {
      await page.goto(path);
      await noSidewaysScroll(page);
    }
    await tabs.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Install the app" })).toBeVisible();
    await expectAccessible(page);
  });

  test("the cockpit stacks into one column", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("complementary", { name: "AI command panel" })).toBeVisible();
    await expect(page.getByText("Files", { exact: true })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize explorer" })).toHaveCount(0);
    await noSidewaysScroll(page);
  });
});

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}
