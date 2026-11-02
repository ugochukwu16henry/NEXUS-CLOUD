import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AUDITED } from "./actions";

// NFR-04 / test plan Sprint 1: every state-changing endpoint emits an audit event. Server actions
// are the only mutation endpoints in Sprint 1, so every one must be built with defineAction().

const APP_DIR = join(__dirname, "..", "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(APP_DIR).filter((file) => /\.(ts|tsx)$/.test(file));
const actionModules = import.meta.glob("../app/**/actions.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

describe("audit sweep", () => {
  it("finds the server action modules", () => {
    expect(Object.keys(actionModules).length).toBeGreaterThanOrEqual(5);
  });

  it("keeps every 'use server' module in a file named actions.ts", () => {
    const misplaced = sourceFiles.filter(
      (file) =>
        /^\s*["']use server["']/m.test(readFileSync(file, "utf8")) && !file.endsWith("actions.ts"),
    );
    expect(misplaced.map((file) => relative(APP_DIR, file))).toEqual([]);
  });

  for (const [path, exports] of Object.entries(actionModules)) {
    it(`audits every action exported from ${path}`, () => {
      const exported = Object.entries(exports);
      expect(exported.length).toBeGreaterThan(0);
      for (const [name, value] of exported) {
        expect(typeof value, `${name} should be a function`).toBe("function");
        expect(
          (value as Record<symbol, unknown>)[AUDITED],
          `${name} must use defineAction`,
        ).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      }
    });
  }

  it("has no route handlers that accept mutations without auditing", () => {
    const routes = sourceFiles.filter((file) => /route\.ts$/.test(file));
    for (const route of routes) {
      const source = readFileSync(route, "utf8");
      const mutating = /export (async )?function (POST|PUT|PATCH|DELETE)/.test(source);
      if (mutating) expect(source, relative(APP_DIR, route)).toContain("recordAudit");
    }
  });
});
