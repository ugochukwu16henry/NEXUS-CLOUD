import { defineConfig } from "vitest/config";

// `pnpm test` runs the unit tests. `pnpm test:int` (--mode int) runs the integration tests, which
// need the local Supabase stack and apps/web/.env.local.
export default defineConfig(({ mode }) => ({
  test: {
    include: mode === "int" ? ["src/**/*.int.test.ts"] : ["src/**/*.test.ts"],
    exclude: mode === "int" ? [] : ["src/**/*.int.test.ts"],
    fileParallelism: false,
  },
}));
