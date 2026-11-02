import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";
import { STRANGER_EMAIL, testEnv } from "./support/env";
import { countMessagesTo } from "./support/mailbox";

test.describe("sign-in and access control", () => {
  test("redirects signed-out visitors from every cockpit route to sign-in", async ({ page }) => {
    for (const path of ["/", "/settings", "/settings/security", "/audit", "/mfa"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
    await page.goto("/settings");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/settings");
  });

  test("login page is accessible and sends security headers", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    const csp = headers["content-security-policy"] ?? "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers["x-powered-by"]).toBeUndefined();

    // Scripts ran under the CSP: the form is interactive and no CSP violations were logged.
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.reload();
    await page.getByLabel("Email").fill("not-an-email");
    expect(violations).toEqual([]);

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
    ).toEqual([]);
  });

  test("does not reveal whether an email has access, and never creates an account for it", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(STRANGER_EMAIL);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("status")).toContainText("If this email has access");

    await page.waitForTimeout(1_500);
    expect(await countMessagesTo(STRANGER_EMAIL)).toBe(0);

    const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
      auth: { persistSession: false },
    });
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.map((user) => user.email)).not.toContain(STRANGER_EMAIL);
  });

  test("owner signs in with a magic link, gets HttpOnly session cookies, and signs out", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await expect(page.getByText("owner", { exact: false }).first()).toBeVisible();

    const sessionCookies = (await context.cookies()).filter((cookie) =>
      cookie.name.startsWith("sb-"),
    );
    expect(sessionCookies.length).toBeGreaterThan(0);
    for (const cookie of sessionCookies) {
      expect(cookie.httpOnly, cookie.name).toBe(true);
      expect(cookie.sameSite, cookie.name).toBe("Lax");
    }

    // Signed-in users are sent away from the login page.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?notice=signed_out/);
    await expect(page.getByRole("status")).toContainText("signed out");

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("treats a tampered or expired session cookie as signed out", async ({ page, context }) => {
    await signIn(page);
    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(
      cookies.map((cookie) =>
        cookie.name.startsWith("sb-")
          ? { ...cookie, value: `${cookie.value.slice(0, -12)}tampered1234` }
          : cookie,
      ),
    );
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects a used or forged sign-in link", async ({ page }) => {
    await page.goto("/auth/callback?code=forged-code");
    await expect(page).toHaveURL(/\/login\?error=link_invalid/);
    await expect(
      page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
    ).toBeVisible();
  });

  test("ignores off-site next parameters", async ({ page }) => {
    await page.goto("/auth/callback?next=https://evil.example");
    await expect(page).toHaveURL(/localhost:\d+\/login/);
  });
});
