/**
 * Audit events (threat model T05, NFR-04). Rows are written server-side with the service role only;
 * the database rejects any update or delete.
 */
export type ActorType = "user" | "agent" | "system";
export type AuditResult = "success" | "denied" | "error";

export type AuditEventInput = {
  workspaceId: string | null;
  actorId: string | null;
  actorType: ActorType;
  /** Dotted lower-case name such as `auth.sign_in` or `session.revoke_all`. */
  action: string;
  targetType?: string;
  targetId?: string;
  result: AuditResult;
  approvalId?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventRow = {
  workspace_id: string | null;
  actor_id: string | null;
  actor_type: ActorType;
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: AuditResult;
  approval_id: string | null;
  correlation_id: string;
  metadata: Record<string, unknown>;
};

/** Same rule as the `audit_events.action` check constraint. */
export const ACTION_PATTERN = /^[a-z_]+(\.[a-z_]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toAuditRow(input: AuditEventInput): AuditEventRow {
  if (!ACTION_PATTERN.test(input.action)) {
    throw new Error(`Invalid audit action name: ${input.action}`);
  }
  if (!UUID.test(input.correlationId)) {
    throw new Error("Audit events need a UUID correlation ID");
  }
  if (input.actorType === "user" && !input.actorId) {
    throw new Error("User audit events need an actor ID");
  }
  return {
    workspace_id: input.workspaceId,
    actor_id: input.actorId,
    actor_type: input.actorType,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    result: input.result,
    approval_id: input.approvalId ?? null,
    correlation_id: input.correlationId,
    metadata: input.metadata ?? {},
  };
}

/** The slice of a Supabase client the writer needs, so tests can pass a fake. */
export type AuditSink = {
  from(table: "audit_events"): {
    insert(row: AuditEventRow): PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function writeAuditEvent(sink: AuditSink, input: AuditEventInput): Promise<void> {
  const { error } = await sink.from("audit_events").insert(toAuditRow(input));
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}
