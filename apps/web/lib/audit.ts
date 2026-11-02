import "server-only";
import { writeAuditEvent, type AuditEventInput, type AuditSink } from "@nexus/audit";
import type { TablesInsert } from "@nexus/db";
import { getCorrelationId, reportError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuditInput = Omit<AuditEventInput, "correlationId"> & { correlationId?: string };

/**
 * Appends an audit event with the secret key (browsers cannot write audit rows). A failed write is
 * reported but does not undo the action that already happened.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  const admin = createSupabaseAdminClient();
  const sink: AuditSink = {
    from: (table) => ({
      // toAuditRow has validated the row; metadata is plain JSON-serialisable data.
      insert: (row) => admin.from(table).insert(row as TablesInsert<"audit_events">),
    }),
  };
  try {
    await writeAuditEvent(sink, {
      ...input,
      correlationId: input.correlationId ?? (await getCorrelationId()),
    });
  } catch (error) {
    reportError(error, { auditAction: input.action });
  }
}
