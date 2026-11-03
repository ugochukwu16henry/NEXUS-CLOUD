import { describe, expect, it } from "vitest";
import { branchFromRef, parseTaskRefs } from "./task-refs";

describe("task references", () => {
  it.each([
    ["task/NX-12-password-reset", [12]],
    ["NX-3: fix the reset link", [3]],
    ["feature/nx-7", [7]],
    ["Refs NX-1, NX-2 and NX-1 again", [1, 2]],
    ["Merge NX-40 into NX-4", [4, 40]],
  ])("finds the tasks in %j", (text, refs) => {
    expect(parseTaskRefs(text)).toEqual(refs);
  });

  it.each([
    ["ANX-12 is another project's key", "ANX-12"],
    ["no number", "NX-"],
    ["zero is not a task", "NX-0"],
    ["a longer number is not cut short", "NX-1234567"],
    ["plain text", "update README"],
  ])("finds nothing in %s", (_label, text) => {
    expect(parseTaskRefs(text)).toEqual([]);
  });

  it("combines several texts and skips empty ones", () => {
    expect(parseTaskRefs("task/NX-5-login", null, undefined, "NX-6: tests")).toEqual([5, 6]);
  });

  it("reads branch names from refs and ignores tags", () => {
    expect(branchFromRef("refs/heads/task/NX-1-login")).toBe("task/NX-1-login");
    expect(branchFromRef("refs/tags/v1.0.0")).toBeNull();
  });
});
