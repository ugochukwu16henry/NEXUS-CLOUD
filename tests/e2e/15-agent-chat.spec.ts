import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";

// The project Agent chat: one saved conversation per project. Messages and replies are kept and
// come back after a reload; another project has its own, empty conversation; files and whole
// folders go with a message; the mic fills the box; a message becomes a task with a queued plan.
// Replies are the recorded model (NEXUS_MODEL_FIXTURE), so nothing is spent.
test.describe.configure({ mode: "serial" });

let firstUrl = "";
let secondUrl = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

async function newProject(page: Page, name: string): Promise<string> {
  await page.goto("/projects");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test.describe("agent chat", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a message gets a reply, with a folder attached", async ({ page }) => {
    firstUrl = await newProject(page, `Chat pilot ${Date.now()}`);
    secondUrl = await newProject(page, `Chat second ${Date.now()}`);

    await page.goto(firstUrl);
    await page
      .getByRole("navigation", { name: "Project sections" })
      .getByRole("link", { name: "Agent" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Agent" })).toBeVisible();
    const conversation = page.getByRole("list", { name: "Conversation" });
    await expect(conversation).toContainText("No messages yet");
    await expectAccessible(page);

    // A folder keeps its structure; node_modules is skipped.
    const root = mkdtempSync(join(tmpdir(), "nexus-chat-"));
    const folder = join(root, "landing");
    mkdirSync(join(folder, "css"), { recursive: true });
    mkdirSync(join(folder, "node_modules", "x"), { recursive: true });
    writeFileSync(join(folder, "index.html"), "<h1>Landing</h1>\n");
    writeFileSync(join(folder, "css", "site.css"), "h1 { color: teal; }\n");
    writeFileSync(join(folder, "node_modules", "x", "index.js"), "skip\n");

    await page.getByRole("button", { name: "Add files to the conversation" }).click();
    await page
      .getByRole("group", { name: "Add to the conversation" })
      .getByLabel("Folder", { exact: true })
      .setInputFiles(folder);
    await expect(page.getByText("2 files ready to send")).toBeVisible();

    await page.getByLabel("Message the agent").fill("Review this landing page and suggest fixes");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const mine = conversation.getByRole("listitem", { name: "You" });
    await expect(mine).toContainText("Review this landing page");
    await expect(mine).toContainText("landing/css/site.css");
    await expect(conversation.getByRole("listitem", { name: "Agent" })).toContainText(
      "Recorded reply from",
    );
    await expect(page.getByLabel("Message the agent")).toHaveValue("");
    await expect(page.getByText("ready to send")).toHaveCount(0);
  });

  test("the conversation is kept, and each project has its own", async ({ page }) => {
    await page.goto(`${firstUrl}/agent`);
    const conversation = page.getByRole("list", { name: "Conversation" });
    await expect(conversation.getByRole("listitem", { name: "You" })).toHaveCount(1);
    await expect(conversation).toContainText("Review this landing page");

    await page.goto(`${secondUrl}/agent`);
    await expect(page.getByRole("list", { name: "Conversation" })).toContainText("No messages yet");

    // The Agents page leads into each project's conversation.
    await page.goto("/agents");
    const chats = page.getByRole("list", { name: "Project conversations" });
    await expect(chats).toContainText("Agent: Recorded reply from");
    await chats.getByRole("link", { name: /Chat pilot/ }).click();
    await expect(page).toHaveURL(new RegExp(`${firstUrl}/agent$`));
  });

  test("speaking fills the box, and a message becomes a task with a queued plan", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class ScriptedRecognition {
        lang = "en-US";
        continuous = false;
        interimResults = false;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            this.onresult?.({
              resultIndex: 0,
              results: [Object.assign([{ transcript: "add a contact form" }], { isFinal: true })],
            });
          }, 50);
        }
        stop() {
          this.onend?.();
        }
      }
      const scope = window as unknown as Record<string, unknown>;
      scope.SpeechRecognition = ScriptedRecognition;
      scope.webkitSpeechRecognition = ScriptedRecognition;
    });
    await page.goto(`${firstUrl}/agent`);
    await page.getByRole("button", { name: "Speak instead of typing" }).click();
    await expect(page.getByLabel("Message the agent")).toHaveValue("add a contact form");
    await page.getByRole("button", { name: "Stop listening" }).click();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const conversation = page.getByRole("list", { name: "Conversation" });
    await expect(conversation.getByRole("listitem", { name: "You" })).toHaveCount(2);

    await conversation
      .getByRole("listitem", { name: "You" })
      .last()
      .getByRole("button", { name: "Make it a task" })
      .click();
    await expect(page.getByTestId("announcer")).toContainText("created and its plan is queued");
    const taskLink = conversation.getByRole("link", { name: /NX-\d+: add a contact form/ });
    await expect(taskLink).toBeVisible();
    await taskLink.click();
    await expect(page.getByRole("heading", { level: 1, name: "add a contact form" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Agent activity" })).toContainText(
      "Add a farewell helper",
      { timeout: 30_000 },
    );
  });

  test("on a phone the box sits at the bottom with the mic and +", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${firstUrl}/agent`);
    await expect(page.getByLabel("Message the agent")).toBeVisible();
    await expect(page.getByRole("button", { name: "Speak instead of typing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add files to the conversation" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectAccessible(page);
  });
});
