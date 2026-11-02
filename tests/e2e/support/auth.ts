import { expect, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { testEnv } from "./env";
import { waitForMagicLink } from "./mailbox";

/** Signs in through the real flow: request a link, read it from Mailpit, open it. */
export async function signIn(page: Page, email = testEnv.ownerEmail): Promise<void> {
  // Mailpit timestamps have second precision; allow for that and small clock differences.
  const since = new Date(Date.now() - 2_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("sign-in link is on its way");
  await page.goto(await waitForMagicLink(email, since));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

let lastCode: string | undefined;

/**
 * A TOTP code for the secret. Waits for the next 30-second window when the current code was
 * already used, since a verified code cannot be replayed.
 */
export async function totpCode(secret: string): Promise<string> {
  const totp = new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
  let code = totp.generate();
  if (code === lastCode) {
    const msUntilNext = 30_000 - (Date.now() % 30_000) + 500;
    await new Promise((resolve) => setTimeout(resolve, msUntilNext));
    code = totp.generate();
  }
  lastCode = code;
  return code;
}
