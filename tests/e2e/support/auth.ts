import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { testEnv } from "./env";
import { waitForMagicLink } from "./mailbox";

/**
 * Signs the owner in. Reuses the session saved by an earlier sign-in in this run when it is still
 * valid, because Supabase limits sign-in emails per hour; pass `fresh: true` when the test needs a
 * brand-new session (testing the sign-in flow itself, or a new session's MFA level).
 */
export async function signIn(page: Page, options: { fresh?: boolean } = {}): Promise<void> {
  if (!options.fresh && existsSync(SESSION_FILE)) {
    await page.context().addCookies(JSON.parse(readFileSync(SESSION_FILE, "utf8")));
    await page.goto("/");
    if (!new URL(page.url()).pathname.startsWith("/login")) {
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      return;
    }
    // Signed out or revoked since it was saved.
    await page.context().clearCookies();
  }
  await signInWithEmail(page, testEnv.ownerEmail);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(await page.context().cookies()));
}

/** The real flow: request a link, read it from Mailpit, open it. */
export async function signInWithEmail(page: Page, email: string): Promise<void> {
  // Mailpit timestamps have second precision; allow for that and small clock differences.
  const since = new Date(Date.now() - 2_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);

  // Supabase also allows only one sign-in email per address per second; wait and ask again.
  const sent = page.getByRole("status").filter({ hasText: "sign-in link is on its way" });
  const throttled = page.getByRole("alert").filter({ hasText: "Too many sign-in attempts" });
  for (let attempt = 1; ; attempt++) {
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(sent.or(throttled)).toBeVisible();
    if (await sent.isVisible()) break;
    if (attempt === 3) throw new Error("Sign-in stayed rate limited after 3 attempts");
    await page.waitForTimeout(2_000 * attempt);
  }

  await page.goto(await waitForMagicLink(email, since));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

const STATE_DIR = join(__dirname, "..", ".state");
const LAST_CODE_FILE = join(STATE_DIR, "last-totp-code");
const SESSION_FILE = join(STATE_DIR, "owner-session.json");

/**
 * A TOTP code for the secret. A verified code cannot be replayed, so when the current code was
 * already used, wait for the next 30-second window. The last code is kept on disk because a
 * Playwright retry runs in a fresh process.
 */
export async function totpCode(secret: string): Promise<string> {
  const totp = new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
  const lastCode = existsSync(LAST_CODE_FILE) ? readFileSync(LAST_CODE_FILE, "utf8").trim() : "";
  let code = totp.generate();
  if (code === lastCode) {
    const msUntilNext = 30_000 - (Date.now() % 30_000) + 500;
    await new Promise((resolve) => setTimeout(resolve, msUntilNext));
    code = totp.generate();
  }
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(LAST_CODE_FILE, code);
  return code;
}

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
  // Enrolled earlier in this run (global setup clears the file). Don't judge from the page: a
  // restored session saved before enrolment still carries a token that says "no authenticator".
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
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
