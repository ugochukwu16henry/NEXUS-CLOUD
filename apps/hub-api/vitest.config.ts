import { defineConfig } from "vitest/config";

// `pnpm test` runs the unit tests in src/. `pnpm test:db` (--mode db) adds the integration tests in
// test/, which recreate and migrate a PostgreSQL database (TEST_DATABASE_URL).
export default defineConfig(({ mode }) => {
  const withDatabase = mode === "db";
  return {
    test: {
      include: withDatabase ? ["src/**/*.spec.ts", "test/**/*.spec.ts"] : ["src/**/*.spec.ts"],
      globalSetup: withDatabase ? ["test/global-setup.ts"] : [],
      fileParallelism: false,
    },
  };
});
