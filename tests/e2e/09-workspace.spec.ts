import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";
import { testEnv } from "./support/env";

// Sprint 4 journey (test plan, ADR 0016/0017): open a file, edit it, see the diff, commit to the
// task branch, open a PR, revert; upload a whole folder (structure kept, node_modules skipped,
// secrets held back); refuse to overwrite a branch that moved; attach pictures to a task.
// GitHub is the local fake with an in-memory Git store (tests/fake-github).
test.describe.configure({ mode: "serial" });
test.skip(!!process.env.E2E_BASE_URL, "needs the local fake GitHub");

const FAKE = "http://localhost:3299";
const REPO = "nexus-test-org/nexus-pilot-app";
const BRANCH = "task/NX-1-login-form";
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
let projectUrl = "";
let taskId = "";
let mainHead = "";

const head = async (page: Page, branch: string) =>
  (
    (await (
      await page.request.get(`${FAKE}/_fake/branch-head?branch=${encodeURIComponent(branch)}`)
    ).json()) as { sha: string }
  ).sha;

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

async function connectGitHub(page: Page, secret: string) {
  await page.goto("/settings/integrations");
  const connect = page.getByRole("button", { name: "Connect GitHub" });
  if (!(await connect.isVisible())) return;
  await connect.click();
  await page.waitForURL(/\/mfa\?|notice=connected/);
  if (page.url().includes("/mfa")) {
    await passMfaChallenge(page, secret);
    await page.getByRole("button", { name: "Connect GitHub" }).click();
  }
  await expect(page).toHaveURL(/notice=connected/);
}

/** Opens the Code tab on task NX-1 with an open change set. */
async function openTask(page: Page) {
  await page.goto(`${projectUrl}/code?task=${taskId}`);
  const start = page.getByRole("button", { name: /Edit this task|Start a branch for this task/ });
  if (await start.isVisible()) {
    await start.click();
    await expect(page.getByRole("heading", { name: /Changes/ })).toBeVisible();
  }
}

test.describe("code workspace", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${FAKE}/_fake/reset`);
    // The fake has one repository; free it from earlier specs so this one can import it.
    const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
      auth: { persistSession: false },
    });
    await admin.from("repositories").delete().eq("full_name", REPO);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("owner edits a file, reviews the diff, commits, opens a PR and reverts", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const secret = await ensureMfa(page);
    await connectGitHub(page, secret);
    mainHead = await head(page, "main");

    await page.goto("/projects");
    await page.getByLabel("Name").fill(`Workspace pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    projectUrl = new URL(page.url()).pathname;
    await page.goto(`${projectUrl}/tasks/new`);
    await page.getByLabel("Title").fill("Login form");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Login form" })).toBeVisible();
    taskId = new URL(page.url()).pathname.split("/").at(-1)!;

    await page.goto(`${projectUrl}/repository`);
    await page.getByLabel("Repository").selectOption({ label: `${REPO} (private)` });
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByRole("heading", { level: 1, name: REPO })).toBeVisible();

    // Browsing main is read-only; editing needs a task.
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("link", { name: "Code" })
      .click();
    await page.getByRole("link", { name: "README.md" }).click();
    await expect(page.getByText(/Read-only: choose a task to edit/)).toBeVisible();

    await openTask(page);
    await expect(page.getByText(BRANCH, { exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "File explorer" })
      .getByRole("link", { name: "index.ts" })
      .click();
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("export const greet = (name: string) => `Hi, ${name}`;\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("announcer")).toHaveText("Saved.");

    const changed = page.getByRole("list", { name: "Changed files" });
    await expect(changed).toContainText("src/index.ts");
    await changed.getByRole("link", { name: "src/index.ts" }).click();
    const diff = page.getByRole("region", { name: "Changes to src/index.ts" });
    await expect(diff).toContainText("Hi, ${name}");
    await expect(diff.getByLabel("added").first()).toBeVisible();
    await page.getByRole("button", { name: "Side by side" }).click();
    await expect(page.getByRole("button", { name: "Side by side" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectAccessible(page);

    await page.getByLabel(/Commit message/).fill("Shorter greeting");
    await page.getByRole("button", { name: "Commit to task branch" }).click();
    await expect(page.getByTestId("announcer")).toHaveText(`Committed 1 file(s) to ${BRANCH}.`);
    expect(await head(page, "main")).toBe(mainHead); // main is never written

    await page.getByRole("button", { name: "Open pull request" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Pull request #\d+ opened\./ }),
    ).toBeVisible();

    const before = await head(page, BRANCH);
    await page.getByText("Revert the latest commit").click();
    await page.getByLabel(/Undo commit/).check();
    await page.getByRole("button", { name: "Revert latest commit" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Reverted the latest commit." }),
    ).toBeVisible();
    expect(await head(page, BRANCH)).not.toBe(before);
  });

  test("a folder upload keeps its structure, skips node_modules and holds back secrets", async ({
    page,
  }) => {
    const root = mkdtempSync(join(tmpdir(), "nexus-upload-"));
    const site = join(root, "site");
    for (const dir of ["css", "img", "node_modules/left-pad"])
      mkdirSync(join(site, dir), { recursive: true });
    writeFileSync(join(site, "index.html"), "<h1>Pilot</h1>\n");
    writeFileSync(join(site, "css", "app.css"), "h1 { color: teal; }\n");
    writeFileSync(join(site, "img", "logo.png"), PNG);
    writeFileSync(join(site, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
    writeFileSync(join(site, ".env"), "API_URL=http://localhost\n");

    await openTask(page);
    await page.getByLabel("Upload folder").setInputFiles(site);
    await expect(page.getByTestId("announcer")).toHaveText(
      "3 file(s) added, 1 held back for you to check.",
      { timeout: 30_000 },
    );
    await page.getByText(/note\(s\)/).click();
    await expect(page.getByRole("list", { name: "Upload notes" })).toContainText(
      "node_modules is skipped",
    );

    const explorer = page.getByRole("navigation", { name: "File explorer" });
    await expect(explorer.getByRole("button", { name: "css" })).toBeVisible();
    const changed = page.getByRole("list", { name: "Changed files" });
    await expect(changed).toContainText("site/index.html");
    await expect(changed).toContainText("site/img/logo.png");
    await expect(changed).toContainText("Held back: .env usually holds secrets");

    // Held files block the commit until the owner decides.
    await page.getByLabel(/Commit message/).fill("Add the site");
    await page.getByRole("button", { name: "Commit to task branch" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "held-back file" })).toBeVisible();
    await changed.getByRole("button", { name: "Drop" }).click();
    await expect(page.getByTestId("announcer")).toHaveText("site/.env was dropped.");

    await page.getByLabel(/Commit message/).fill("Add the site");
    await page.getByRole("button", { name: "Commit to task branch" }).click();
    await expect(page.getByTestId("announcer")).toContainText("Committed 3 file(s)");

    await page.goto(
      `${projectUrl}/code?task=${taskId}&path=${encodeURIComponent("site/img/logo.png")}`,
    );
    await expect(page.getByRole("img", { name: "Preview of site/img/logo.png" })).toBeVisible();
  });

  test("a task branch that moved on GitHub is never overwritten", async ({ page, request }) => {
    await openTask(page);
    await page
      .getByRole("navigation", { name: "File explorer" })
      .getByRole("link", { name: "README.md" })
      .click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nEdited in Nexus.\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("announcer")).toHaveText("Saved.");

    await request.post(`${FAKE}/_fake/advance?branch=${encodeURIComponent(BRANCH)}`);
    const moved = await head(page, BRANCH);
    await page.getByLabel(/Commit message/).fill("Readme note");
    await page.getByRole("button", { name: "Commit to task branch" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "changed on GitHub since you started" }),
    ).toBeVisible();
    expect(await head(page, BRANCH)).toBe(moved);

    await page.reload();
    await page.getByRole("button", { name: "Move to latest" }).click();
    await expect(page.getByTestId("announcer")).toContainText("now sit on the latest commit");
    await page.getByLabel(/Commit message/).fill("Readme note");
    await page.getByRole("button", { name: "Commit to task branch" }).click();
    await expect(page.getByTestId("announcer")).toContainText("Committed 1 file(s)");
  });

  test("pictures attached to a task show as thumbnails; SVGs are never shown inline", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/tasks/${taskId}`);
    await page.getByLabel("Add files").setInputFiles([
      { name: "design.png", mimeType: "image/png", buffer: PNG },
      {
        name: "evil.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      },
    ]);
    await expect(page.getByTestId("announcer")).toHaveText("2 file(s) added.", { timeout: 30_000 });
    const attached = page.getByRole("list", { name: "Attached files" });
    await expect(attached.getByRole("img", { name: "design.png" })).toBeVisible();
    await expect(attached.getByRole("img", { name: "evil.svg" })).toHaveCount(0);
    await expect(attached.getByRole("link", { name: "evil.svg" })).toBeVisible();
    await expectAccessible(page);
  });
});
