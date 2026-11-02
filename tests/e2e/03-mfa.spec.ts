import { expect, test } from "@playwright/test";
import { saveTotpSecret, signIn, totpCode } from "./support/auth";

// One journey: the owner's MFA state carries from step to step, so these run in order.
test.describe.configure({ mode: "serial" });

let secret = "";

test.describe("two-factor authentication for risk actions", () => {
  test("a risk action without MFA set up is blocked and points to setup", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();

    await expect(page).toHaveURL(/\/mfa\?next=%2Fsettings/);
    await expect(page.getByText("you haven't set it up yet")).toBeVisible();
    await page.getByRole("link", { name: "Set up an authenticator app" }).click();
    await expect(page).toHaveURL(/\/settings\/security/);
  });

  test("owner enrols an authenticator app", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up an authenticator app" }).click();
    await expect(
      page.getByRole("img", { name: "QR code for your authenticator app" }),
    ).toBeVisible();

    secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    saveTotpSecret(secret);

    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();

    await page.getByLabel("Authentication code").fill(await totpCode(secret));
    await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
    // The page re-renders into its enrolled state.
    await expect(
      page.getByRole("status").filter({ hasText: "set up and verified for this session" }),
    ).toBeVisible();
    await expect(page.getByText("MFA verified")).toBeVisible();
  });

  test("a new session must pass the challenge before signing out everywhere", async ({ page }) => {
    test.skip(!secret, "needs the enrolment step");
    await signIn(page);
    await expect(page.getByText("MFA on")).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/mfa\?next=%2Fsettings/);

    await page.getByLabel("Authentication code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();

    await page.getByLabel("Authentication code").fill(await totpCode(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("MFA verified")).toBeVisible();

    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/login\?notice=signed_out_all/);
  });

  test("the audit log recorded the journey", async ({ page }) => {
    test.skip(!secret, "needs the earlier steps");
    await signIn(page);
    await page.goto("/audit");
    const table = page.getByRole("table");

    for (const action of [
      "workspace.bootstrap",
      "auth.sign_in",
      "auth.sign_out",
      "auth.mfa_enrolled",
      "auth.mfa_verified",
      "session.revoke_all",
      "profile.update",
    ]) {
      await expect(table.getByText(action, { exact: true }).first(), action).toBeVisible();
    }
    // Blocked attempts are audited too.
    const denied = table
      .getByRole("row")
      .filter({ hasText: "session.revoke_all" })
      .filter({ hasText: "denied" });
    await expect(denied.first()).toBeVisible();
  });
});
