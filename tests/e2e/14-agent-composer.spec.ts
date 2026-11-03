import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";

// The agent composer: type or speak, and + to add files. Live dictation uses the browser's speech
// recognition (replaced here by a scripted one); without it the mic records and the server
// transcribes (Chromium's fake microphone, and the recorded transcription in fixture mode).
test.describe.configure({ mode: "serial" });
// Chromium's built-in fake microphone, granted without a prompt.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

let taskUrl = "";
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

test.describe("agent composer", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("speaking with live dictation fills the box, and Plan sends it", async ({ page }) => {
    await page.goto("/projects");
    await page.getByLabel("Name").fill(`Voice pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectUrl = new URL(page.url()).pathname;
    await page.goto(`${projectUrl}/tasks/new`);
    await page.getByLabel("Title").fill("Dark mode");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dark mode" })).toBeVisible();
    taskUrl = new URL(page.url()).pathname;

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
              results: [
                Object.assign([{ transcript: "add a dark mode toggle" }], { isFinal: true }),
              ],
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
    await page.goto(taskUrl);
    const box = page.getByLabel("What should the agent do?");
    await box.fill("Please");
    const mic = page.getByRole("button", { name: "Speak instead of typing" });
    await mic.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(box).toHaveValue("Please add a dark mode toggle");
    await page.getByRole("button", { name: "Stop listening" }).click();
    await expect(mic).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Plan queued" })).toBeVisible();
  });

  test("the + menu adds a picture to the task, and explains code files need a branch", async ({
    page,
  }) => {
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Attach files or pictures" }).click();
    const menu = page.getByRole("group", { name: "Add to this task" });
    await expect(menu).toContainText("start a branch for this task");
    await menu.getByLabel("Pictures or PDFs for the task").setInputFiles({
      name: "mockup.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByTestId("announcer")).toHaveText("1 file(s) added.");
  });
});

test.describe("recorded voice when the browser can't transcribe", () => {
  test("the mic records, the server transcribes, the text lands in the box", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      // No live dictation here, so the composer records instead.
      const scope = window as unknown as Record<string, unknown>;
      delete scope.webkitSpeechRecognition;
      delete scope.SpeechRecognition;
    });
    await page.goto(taskUrl);
    await page.getByRole("button", { name: "Speak instead of typing" }).click();
    await expect(page.getByText("Listening… tap the mic to stop")).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Stop listening" }).click();
    await expect(page.getByLabel("What should the agent do?")).toHaveValue(
      /Recorded transcript from the microphone\./,
    );
    await expect(page.getByText("Transcribed. Check the text, then send.")).toBeVisible();
  });
});
