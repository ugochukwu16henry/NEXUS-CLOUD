import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

const STATE_DIR = join(__dirname, "..", ".state");
const SECRET_FILE = join(STATE_DIR, "totp-secret");

/** Remembers the owner's TOTP secret so later spec files in the same run can pass MFA challenges. */
export function saveTotpSecret(secret: string) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SECRET_FILE, secret);
}

/**
 * Returns the owner's TOTP secret, enrolling an authenticator first when none is set up (for
 * example when a spec file runs on its own).
 */
export async function ensureMfa(page: Page): Promise<string> {
  await page.goto("/settings/security");
  const setUp = page.getByRole("button", { name: "Set up an authenticator app" });
  if (!(await setUp.isVisible())) {
    if (!existsSync(SECRET_FILE))
      throw new Error("MFA is enrolled but its secret was not saved by this run");
    return readFileSync(SECRET_FILE, "utf8").trim();
  }
  await setUp.click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Authentication code").fill(await totpCode(secret));
  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await expect(page.getByRole("status").filter({ hasText: "set up and verified" })).toBeVisible();
  saveTotpSecret(secret);
  return secret;
}

/** Completes an MFA challenge page if the app redirected there. */
export async function passMfaChallenge(page: Page, secret: string) {
  await expect(page).toHaveURL(/\/mfa\?next=/);
  await page.getByLabel("Authentication code").fill(await totpCode(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).not.toHaveURL(/\/mfa/);
}
