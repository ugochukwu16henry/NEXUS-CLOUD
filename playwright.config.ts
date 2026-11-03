import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const FAKE_GITHUB = "http://localhost:3299";
const WORKER_PORT = 8787;

/** The worker reads its settings from the environment; locally they come from apps/web/.env.local. */
function localEnv(): Record<string, string> {
  const path = "apps/web/.env.local";
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}
const local = localEnv();
const GITHUB_ENV = {
  GITHUB_APP_ID: "424242",
  GITHUB_APP_SLUG: "nexus-test",
  GITHUB_APP_CLIENT_ID: "Iv1.e2etest",
  GITHUB_API_URL: FAKE_GITHUB,
  GITHUB_WEB_URL: FAKE_GITHUB,
};

// The GitHub App key pair and secrets exist only for this run: generated here, handed to the app
// and the fake GitHub through the environment, never written to disk. Workers re-read this config
// and inherit the environment, so they reuse the same values (the webhook secret signs test calls).
if (!process.env.E2E_GITHUB_PRIVATE_KEY) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.E2E_GITHUB_PRIVATE_KEY = privateKey
    .export({ type: "pkcs1", format: "pem" })
    .toString();
  process.env.E2E_GITHUB_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.E2E_GITHUB_WEBHOOK_SECRET = randomBytes(24).toString("hex");
  process.env.E2E_GITHUB_CLIENT_SECRET = randomBytes(16).toString("hex");
}

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Tests share one owner account and its MFA state, so they run in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node tests/fake-github/server.mjs",
          url: `${FAKE_GITHUB}/_fake/health`,
          reuseExistingServer: false,
          env: {
            FAKE_GITHUB_PORT: "3299",
            FAKE_GITHUB_APP_URL: `http://localhost:${PORT}`,
            FAKE_GITHUB_APP_ID: "424242",
            FAKE_GITHUB_PUBLIC_KEY: process.env.E2E_GITHUB_PUBLIC_KEY!,
            FAKE_GITHUB_CLIENT_SECRET: process.env.E2E_GITHUB_CLIENT_SECRET!,
          },
        },
        {
          command: `pnpm --filter @nexus/web exec next start --port ${PORT}`,
          url: `http://localhost:${PORT}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...GITHUB_ENV,
            GITHUB_APP_CLIENT_SECRET: process.env.E2E_GITHUB_CLIENT_SECRET!,
            GITHUB_APP_PRIVATE_KEY: process.env.E2E_GITHUB_PRIVATE_KEY!,
            GITHUB_WEBHOOK_SECRET: process.env.E2E_GITHUB_WEBHOOK_SECRET!,
            NEXUS_MODEL_FIXTURE: "1",
            NEXUS_AGENT_FIXTURE: "1",
            WORKER_WS_URL: `ws://127.0.0.1:${WORKER_PORT}`,
          },
        },
        {
          // The worker runs agent jobs and terminals with recorded models and the recorded sandbox.
          command: "pnpm --filter @nexus/worker exec tsx src/index.ts",
          url: `http://127.0.0.1:${WORKER_PORT}/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL ?? "",
            SUPABASE_SECRET_KEY: local.SUPABASE_SECRET_KEY ?? "",
            DATABASE_URL: local.DATABASE_URL ?? "",
            ...GITHUB_ENV,
            GITHUB_APP_PRIVATE_KEY: process.env.E2E_GITHUB_PRIVATE_KEY!,
            NEXUS_AGENT_FIXTURE: "1",
            NEXUS_SANDBOX_DRIVER: "recorded",
            WORKER_PORT: String(WORKER_PORT),
          },
        },
      ],
});
