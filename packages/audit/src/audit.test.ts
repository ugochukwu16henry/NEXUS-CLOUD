import { describe, expect, it } from "vitest";
import { toAuditRow, writeAuditEvent, type AuditEventInput, type AuditEventRow } from "./audit";

const base: AuditEventInput = {
  workspaceId: "10000000-0000-0000-0000-000000000001",
  actorId: "00000000-0000-0000-0000-00000000000a",
  actorType: "user",
  action: "auth.sign_in",
  result: "success",
  correlationId: "6f1c2a4e-3b5d-4c7e-9f10-2a3b4c5d6e7f",
};

describe("toAuditRow", () => {
  it("maps to snake_case columns with null defaults", () => {
    expect(toAuditRow(base)).toEqual({
      workspace_id: base.workspaceId,
      project_id: null,
      actor_id: base.actorId,
      actor_type: "user",
      action: "auth.sign_in",
      target_type: null,
      target_id: null,
      result: "success",
      approval_id: null,
      correlation_id: base.correlationId,
      metadata: {},
    });
  });

  it.each(["signin", "Auth.SignIn", "auth.", "auth..sign_in", "auth.sign-in"])(
    "rejects the action name %s",
    (action) => {
      expect(() => toAuditRow({ ...base, action })).toThrow(/Invalid audit action/);
    },
  );

  it("carries the project for the activity timeline", () => {
    expect(
      toAuditRow({ ...base, projectId: "40000000-0000-0000-0000-000000000001" }).project_id,
    ).toBe("40000000-0000-0000-0000-000000000001");
  });

  it("requires a UUID correlation ID", () => {
    expect(() => toAuditRow({ ...base, correlationId: "abc" })).toThrow(/correlation/);
  });

  it("requires an actor for user events but not for system events", () => {
    expect(() => toAuditRow({ ...base, actorId: null })).toThrow(/actor/);
    expect(toAuditRow({ ...base, actorType: "system", actorId: null }).actor_id).toBeNull();
  });
});

describe("writeAuditEvent", () => {
  function fakeSink(error: { message: string } | null = null) {
    const rows: AuditEventRow[] = [];
    return {
      rows,
      sink: {
        from: () => ({
          insert: async (row: AuditEventRow) => {
            rows.push(row);
            return { error };
          },
        }),
      },
    };
  }

  it("inserts exactly one row", async () => {
    const { rows, sink } = fakeSink();
    await writeAuditEvent(sink, base);
    expect(rows).toHaveLength(1);
  });

  it("throws when the database rejects the row", async () => {
    const { sink } = fakeSink({ message: "permission denied" });
    await expect(writeAuditEvent(sink, base)).rejects.toThrow(/permission denied/);
  });
});
