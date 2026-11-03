import {
  firstError,
  formObject,
  milestoneFields,
  projectFields,
  taskFields,
  taskMove,
} from "./schemas";

function fd(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("projectFields", () => {
  it("parses a full project", () => {
    expect(
      projectFields.parse({
        name: "  Pilot ",
        stack: "Next.js",
        environments: "dev, staging\nproduction",
        budgetUsd: "120.456",
      }),
    ).toEqual({
      name: "Pilot",
      stack: "Next.js",
      environments: ["dev", "staging", "production"],
      budgetUsd: 120.46,
    });
  });

  it("treats an empty budget as zero", () => {
    expect(
      projectFields.parse({ name: "x", stack: "", environments: "", budgetUsd: "" }).budgetUsd,
    ).toBe(0);
  });

  it.each([
    [{ name: "" }, "Name is required."],
    [{ budgetUsd: "-5" }, "Amounts can't be negative."],
    [{ budgetUsd: "lots" }, "Enter an amount in USD."],
    [
      { environments: "Prod Env" },
      "Environments are short lower-case names like dev, staging, production.",
    ],
  ])("rejects %j", (override, message) => {
    const result = projectFields.safeParse({
      name: "x",
      stack: "",
      environments: "dev",
      budgetUsd: "1",
      ...override,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstError(result.error)).toBe(message);
  });
});

describe("taskFields", () => {
  const base = {
    title: "Reset endpoint",
    description: "",
    assignee: "",
    assigneeType: "human",
    budgetUsd: "",
    dueDate: "",
    acceptanceCriteria: "",
    evidenceLinks: "",
    requirementId: "",
    milestoneId: "",
  };

  it("turns empty optional fields into nulls", () => {
    expect(taskFields.parse(base)).toMatchObject({
      assignee: null,
      dueDate: null,
      requirementId: null,
      milestoneId: null,
      evidenceLinks: [],
    });
  });

  it("accepts https evidence links and rejects others", () => {
    expect(
      taskFields.parse({ ...base, evidenceLinks: "https://github.com/x/pull/1" }).evidenceLinks,
    ).toEqual(["https://github.com/x/pull/1"]);
    for (const bad of ["http://example.com", "javascript:alert(1)", "not a url"]) {
      expect(taskFields.safeParse({ ...base, evidenceLinks: bad }).success, bad).toBe(false);
    }
  });

  it("validates dates and ids", () => {
    expect(taskFields.safeParse({ ...base, dueDate: "2026-13-40" }).success).toBe(false);
    expect(taskFields.safeParse({ ...base, milestoneId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("taskMove", () => {
  it("only accepts real workflow states", () => {
    const valid = {
      projectId: "40000000-0000-4000-8000-000000000001",
      taskId: "70000000-0000-4000-8000-000000000001",
      version: "3",
      to: "in_progress",
      blockedReason: "",
    };
    expect(taskMove.parse(valid)).toMatchObject({ version: 3, blockedReason: null });
    expect(taskMove.safeParse({ ...valid, to: "shipped" }).success).toBe(false);
  });

  it("works when the form has no reason field (any target except Blocked)", () => {
    const { blockedReason: _omit, ...withoutReason } = {
      projectId: "40000000-0000-4000-8000-000000000001",
      taskId: "70000000-0000-4000-8000-000000000001",
      version: "3",
      to: "in_progress",
      blockedReason: "",
    };
    expect(taskMove.parse(withoutReason).blockedReason).toBeNull();
  });
});

describe("milestoneFields", () => {
  it("parses a milestone", () => {
    const base = { title: "M1", criteria: "", targetDate: "2026-12-01", status: "planned" };
    expect(milestoneFields.parse(base)).toMatchObject({ title: "M1", status: "planned" });
  });
});

describe("formObject", () => {
  it("collects repeated fields into arrays", () => {
    expect(
      formObject(
        fd([
          ["a", "1"],
          ["b", "2"],
          ["b", "3"],
        ]),
      ),
    ).toEqual({ a: "1", b: ["2", "3"] });
  });
});
