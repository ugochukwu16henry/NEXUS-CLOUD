import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";
import { testEnv } from "./support/env";

// Files in and out from any device: upload a zipped folder (phones can't pick folders), download
// the task's files as a .zip, the Code tab on a phone screen, and a folder on this computer kept in
// step with the task (the folder picker is replaced by an in-memory folder, since a test can't
// click the browser's own dialog).
test.describe.configure({ mode: "serial" });
test.skip(!!process.env.E2E_BASE_URL, "needs the local fake GitHub");

const FAKE = "http://localhost:3299";
const REPO = "nexus-test-org/nexus-pilot-app";
let codeUrl = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

/** An in-memory stand-in for showDirectoryPicker, shaped like the File System Access API. */
function fakeFolder() {
  const files = new Map<string, Uint8Array>();
  (window as unknown as { __folder: typeof files }).__folder = files;
  const file = (path: string, name: string) => ({
    kind: "file" as const,
    name,
    getFile: async () => new File([files.get(path)!.slice().buffer], name),
    createWritable: async () => {
      let data = new Uint8Array();
      return {
        write: async (chunk: Uint8Array) => {
          data = new Uint8Array(chunk);
        },
        close: async () => {
          files.set(path, data);
        },
      };
    },
  });
  const dir = (prefix: string, name: string): unknown => ({
    kind: "directory",
    name,
    async *values() {
      const seen = new Set<string>();
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue;
        const [head, ...rest] = path.slice(prefix.length).split("/");
        if (!head || seen.has(head)) continue;
        seen.add(head);
        yield rest.length > 0 ? dir(`${prefix}${head}/`, head) : file(path, head);
      }
    },
    getDirectoryHandle: async (child: string) => dir(`${prefix}${child}/`, child),
    getFileHandle: async (child: string) => file(`${prefix}${child}`, child),
  });
  (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
    async () => dir("", "my-copy");
}

test.describe("files from any device", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${FAKE}/_fake/reset`);
    const admin = createClient(testEnv.supabaseUrl, testEnv.secretKey, {
      auth: { persistSession: false },
    });
    await admin.from("repositories").delete().eq("full_name", REPO);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a zipped folder uploads with its structure, and the task downloads as a zip", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const secret = await ensureMfa(page);
    await page.goto("/settings/integrations");
    const connect = page.getByRole("button", { name: "Connect GitHub" });
    if (await connect.isVisible()) {
      await connect.click();
      await page.waitForURL(/\/mfa\?|notice=connected/);
      if (page.url().includes("/mfa")) {
        await passMfaChallenge(page, secret);
        await page.getByRole("button", { name: "Connect GitHub" }).click();
      }
      await expect(page).toHaveURL(/notice=connected/);
    }

    await page.goto("/projects");
    await page.getByLabel("Name").fill(`Files pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectUrl = new URL(page.url()).pathname;
    await page.goto(`${projectUrl}/tasks/new`);
    await page.getByLabel("Title").fill("Landing page");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Landing page" })).toBeVisible();
    const taskId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.goto(`${projectUrl}/repository`);
    await page.getByLabel("Repository").selectOption({ label: `${REPO} (private)` });
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByRole("heading", { level: 1, name: REPO })).toBeVisible();

    codeUrl = `${projectUrl}/code?task=${taskId}`;
    await page.goto(codeUrl);
    await page.getByRole("button", { name: /Edit this task|Start a branch for this task/ }).click();
    await expect(page.getByRole("heading", { name: /Changes/ })).toBeVisible();

    const zip = zipSync({
      "site/index.html": strToU8("<h1>Landing</h1>\n"),
      "site/css/app.css": strToU8("h1 { color: teal; }\n"),
      "__MACOSX/site/._index.html": strToU8("junk"),
    });
    await page.getByLabel("Upload .zip").setInputFiles({
      name: "site.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
    await expect(page.getByTestId("announcer")).toHaveText("2 file(s) added.");
    const changed = page.getByRole("list", { name: "Changed files" });
    await expect(changed).toContainText("site/index.html");
    await expect(changed).toContainText("site/css/app.css");
    await expect(changed).not.toContainText("__MACOSX");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download .zip" }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toMatch(/^nexus-pilot-app-task-NX-\d+-landing-page\.zip$/);
    const files = unzipSync(new Uint8Array(readFileSync((await saved.path())!)));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["README.md", "src/index.ts", "public/logo.png", "site/index.html"]),
    );
    expect(new TextDecoder().decode(files["site/index.html"])).toBe("<h1>Landing</h1>\n");
  });

  test("a folder on this computer: bring the task in, send an edit back", async ({ page }) => {
    await page.addInitScript(fakeFolder);
    await page.goto(codeUrl);
    const panel = page.getByRole("region", { name: "Folder on this computer" });
    await panel.getByRole("button", { name: "Open a folder" }).click();
    await expect(panel.getByRole("status")).toHaveText("Folder my-copy is ready.");

    await panel.getByRole("button", { name: "Bring into folder" }).click();
    await expect(panel.getByRole("status").first()).toContainText("into my-copy.");
    const folder = await page.evaluate(() =>
      [...(window as unknown as { __folder: Map<string, Uint8Array> }).__folder.keys()].sort(),
    );
    expect(folder).toEqual(expect.arrayContaining(["README.md", "site/index.html"]));

    await panel.getByRole("button", { name: "Bring into folder" }).click();
    await expect(panel.getByText("The folder already matches this task.")).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __folder: Map<string, Uint8Array> }).__folder.set(
        "README.md",
        new TextEncoder().encode("# Edited on my laptop\n"),
      );
    });
    await panel.getByRole("button", { name: "Send to Nexus" }).click();
    await expect(panel.getByText("Sent 1 changed file(s) to Nexus.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Changed files" })).toContainText("README.md");
    await expectAccessible(page);
  });

  test("on a phone the menu replaces the side panel and the Code tab stacks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(codeUrl);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Projects" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Menu" }).click();

    await expect(page.getByLabel("Upload .zip")).toBeAttached();
    await expect(page.getByText("On a phone, zip the folder first")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download .zip" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectAccessible(page);
  });
});
