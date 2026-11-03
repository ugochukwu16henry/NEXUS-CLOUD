import { createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureMfa, passMfaChallenge, signIn } from "./support/auth";

// Sprint 3 journey (test plan): connect GitHub, import a repository, see branches, pull requests
// and checks, then have a pushed commit reach the timeline and the task through a signed webhook.
// GitHub is played by tests/fake-github/server.mjs, which checks the app's signed JWT.
test.describe.configure({ mode: "serial" });
test.skip(!!process.env.E2E_BASE_URL, "needs the local fake GitHub");

const FAKE = "http://localhost:3299";
const REPO = { id: 9001, full_name: "nexus-test-org/nexus-pilot-app" };
let projectUrl = "";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

/** Sends a webhook the way GitHub does: JSON body, delivery ID and HMAC-SHA256 signature. */
async function sendWebhook(
  request: APIRequestContext,
  event: string,
  payload: unknown,
  options: { deliveryId?: string; secret?: string } = {},
) {
  const body = JSON.stringify(payload);
  const secret = options.secret ?? process.env.E2E_GITHUB_WEBHOOK_SECRET!;
  return request.post("/api/webhooks/github", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": options.deliveryId ?? randomUUID(),
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
}

const pushPayload = (sha: string) => ({
  ref: "refs/heads/task/NX-1-login-form",
  after: sha,
  deleted: false,
  repository: REPO,
  installation: { id: 4242 },
  commits: [
    {
      id: sha,
      message: "NX-1: validate the email field",
      timestamp: new Date().toISOString(),
      url: `https://github.com/${REPO.full_name}/commit/${sha}`,
      author: { name: "Henry" },
    },
  ],
});

test.describe("GitHub integration", () => {
  test.beforeEach(async ({ page, request }) => {
    await request.post(`${FAKE}/_fake/reset`);
    await signIn(page);
  });

  test("owner connects GitHub through a verified installation", async ({ page }) => {
    // Several round trips through the fake GitHub plus two accessibility scans: slower on CI.
    test.setTimeout(90_000);
    const secret = await ensureMfa(page);
    await page.goto("/settings/integrations");
    await expect(page.getByRole("heading", { level: 1, name: "Integrations" })).toBeVisible();

    await page.getByRole("button", { name: "Connect GitHub" }).click();
    // Connecting grants repository access, so it needs the second factor first (unless this
    // session already passed it). Wait for wherever the click leads before deciding.
    await page.waitForURL(/\/mfa\?|notice=connected/);
    if (page.url().includes("/mfa")) {
      await passMfaChallenge(page, secret);
      await page.getByRole("button", { name: "Connect GitHub" }).click();
    }

    await expect(page).toHaveURL(/\/settings\/integrations\?notice=connected/);
    await expect(
      page.getByRole("status").filter({ hasText: "GitHub is connected." }),
    ).toBeVisible();
    await expect(page.getByText("nexus-test-org")).toBeVisible();
    await expect(page.getByText("Healthy")).toBeVisible();
    await expectAccessible(page);
  });

  test("a forged or replayed install callback is refused", async ({ page }) => {
    // Verified with MFA (a risk action triggers the challenge), so the only thing missing is
    // this session's state cookie.
    const secret = await ensureMfa(page);
    await page.goto("/settings/integrations");
    await page.getByRole("button", { name: "Change repository access" }).click();
    await passMfaChallenge(page, secret);
    await page.goto("/integrations/github/setup?installation_id=4242&code=stolen&state=guess");
    await expect(page).toHaveURL(/error=state/);
    await expect(page.getByRole("alert").filter({ hasText: "didn't start here" })).toBeVisible();
  });

  test("owner imports a repository and sees branches, pull requests and checks", async ({
    page,
    request,
  }) => {
    await page.goto("/projects");
    await page.getByLabel("Name").fill(`GitHub pilot ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    projectUrl = new URL(page.url()).pathname;

    await page.goto(`${projectUrl}/tasks/new`);
    await page.getByLabel("Title").fill("Login form");
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Login form" })).toBeVisible();

    await page.goto(`${projectUrl}/repository`);
    await page.getByLabel("Repository").selectOption({ label: `${REPO.full_name} (private)` });
    await page.getByRole("button", { name: "Import repository" }).click();
    await expect(page.getByRole("heading", { level: 1, name: REPO.full_name })).toBeVisible();

    await expect(page.getByRole("list", { name: "Branches" })).toContainText(
      "task/NX-1-login-form",
    );
    await expect(page.getByRole("list", { name: "Pull requests" })).toContainText("Login form");
    await expect(page.getByRole("list", { name: "Pull requests" })).toContainText("Checks passed");
    // The branch name mentions NX-1, so the task is linked.
    await expect(page.getByRole("list", { name: "Work linked to tasks" })).toContainText("NX-1");
    await expectAccessible(page);

    // Least privilege: every token was narrowed to this repository with read-only access.
    const scopes = (await (await request.get(`${FAKE}/_fake/token-requests`)).json()) as {
      repository_ids?: number[];
      permissions: Record<string, string>;
    }[];
    const repoTokens = scopes.filter((scope) => scope.repository_ids);
    expect(repoTokens.length).toBeGreaterThan(0);
    for (const scope of repoTokens) {
      expect(scope.repository_ids).toEqual([REPO.id]);
      expect(Object.values(scope.permissions).every((level) => level === "read")).toBe(true);
    }
  });

  test("a pushed commit reaches the timeline and the task within 30 seconds", async ({
    page,
    request,
  }) => {
    const sha = "c".repeat(40);
    const response = await sendWebhook(request, "push", pushPayload(sha));
    expect(response.status()).toBe(202);

    await expect(async () => {
      await page.goto(`${projectUrl}/activity`);
      await expect(page.getByRole("list", { name: "Project activity" })).toContainText(
        "GitHub pushed to GitHub (1 commit to task/NX-1-login-form · NX-1)",
      );
    }).toPass({ timeout: 30_000 });

    await page.goto(`${projectUrl}/board`);
    await page
      .getByRole("link", { name: /Login form/ })
      .first()
      .click();
    const linked = page.getByRole("list", { name: "Linked GitHub work" });
    await expect(linked).toContainText("task/NX-1-login-form");
    await expect(linked).toContainText("ccccccc");
    await expect(linked).toContainText("validate the email field");
  });

  test("a replayed delivery is applied once and a forged one is rejected", async ({
    page,
    request,
  }) => {
    const deliveryId = randomUUID();
    const first = await sendWebhook(request, "push", pushPayload("d".repeat(40)), { deliveryId });
    const replay = await sendWebhook(request, "push", pushPayload("d".repeat(40)), { deliveryId });
    expect(first.status()).toBe(202);
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ duplicate: true });

    const forged = await sendWebhook(request, "push", pushPayload("e".repeat(40)), {
      secret: "not-the-webhook-secret",
    });
    expect(forged.status()).toBe(401);

    await page.goto("/settings/integrations");
    const deliveries = page.getByRole("table", { name: "Recent GitHub webhook deliveries" });
    await expect(deliveries.getByRole("row")).toHaveCount(3); // header + 2 stored deliveries
  });

  test("a GitHub outage shows as degraded, and recovery shows as healthy", async ({
    page,
    request,
  }) => {
    await page.goto(`${projectUrl}/repository`);
    await request.post(`${FAKE}/_fake/outage?count=10`);
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "isn't responding" })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/GitHub: degraded/)).toBeVisible();

    await request.post(`${FAKE}/_fake/reset`);
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Synced:" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("GitHub: GitHub is answering normally.")).toBeVisible();
  });
});
