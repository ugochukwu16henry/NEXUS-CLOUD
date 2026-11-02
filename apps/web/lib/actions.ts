import "server-only";
import { authorize, type Permission } from "@nexus/auth";
import type { AuditResult } from "@nexus/audit";
import type { Logger } from "@nexus/observability";
import { redirect, unstable_rethrow } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { getCorrelationId, logger, reportError } from "@/lib/observability";
import { safeRedirectPath } from "@/lib/safe-redirect";
import type { ActionState } from "@/lib/action-state";

/** Marks functions built by `defineAction`; the audit sweep test checks every server action has it. */
export const AUDITED = Symbol.for("nexus.audited-action");

/** `public`: no session needed. `authenticated`: any signed-in user. Otherwise a permission. */
export type Access = "public" | "authenticated" | Permission;

export type ActionContext = {
  viewer: Viewer | null;
  correlationId: string;
  log: Logger;
};

/** What a handler returns: the state shown to the user plus optional audit details. */
export type HandlerResult = ActionState & {
  audit?: {
    result?: AuditResult;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  };
};

const INVALID = Symbol("invalid-input");
/** Returned by `parse` to reject input; a distinct type so handlers only ever see valid input. */
export type Invalid = { readonly [INVALID]: string };
export function invalid(message: string): Invalid {
  return { [INVALID]: message };
}

export type ActionConfig<Input> = {
  /** Audit action name, e.g. `session.revoke_all`. */
  name: string;
  access: Access;
  /** Validates form input; return `invalid(message)` to reject it before anything changes. */
  parse: (formData: FormData) => Input | Invalid;
  /** Where to come back to after an MFA challenge (risk actions). */
  mfaReturnTo?: string;
};

export type ServerAction = ((prev: ActionState, formData: FormData) => Promise<ActionState>) & {
  [AUDITED]?: string;
};

function isNextControlFlow(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

/**
 * Wraps a server action so that every call is authorised, MFA-gated for risk permissions, and
 * audited exactly once (NFR-04), whatever the outcome.
 */
export function defineAction<Input>(
  config: ActionConfig<Input>,
  handler: (input: Input, context: ActionContext) => Promise<HandlerResult>,
): ServerAction {
  const action: ServerAction = async (_prev, formData) => {
    const correlationId = await getCorrelationId();
    const log = logger.child({ correlationId, action: config.name });
    const viewer = await getViewer();

    const audit = (result: AuditResult, details: HandlerResult["audit"] = {}) =>
      recordAudit({
        workspaceId: viewer?.workspaceId ?? null,
        actorId: viewer?.userId ?? null,
        actorType: viewer ? "user" : "system",
        action: config.name,
        result,
        correlationId,
        targetType: details.targetType,
        targetId: details.targetId,
        metadata: details.metadata,
      });

    if (config.access !== "public") {
      if (!viewer) {
        await audit("denied", { metadata: { reason: "not_signed_in" } });
        redirect("/login");
      }
      if (config.access !== "authenticated") {
        const decision = authorize({ role: viewer.role, aal: viewer.aal }, config.access);
        if (!decision.allowed) {
          await audit("denied", { metadata: { reason: decision.reason } });
          if (decision.reason === "mfa_required") {
            redirect(`/mfa?next=${encodeURIComponent(safeRedirectPath(config.mfaReturnTo))}`);
          }
          return { status: "error", message: "You don't have permission to do that." };
        }
      }
    }

    const input = config.parse(formData);
    if (typeof input === "object" && input !== null && INVALID in input) {
      return { status: "error", message: input[INVALID] };
    }

    try {
      const { audit: details, ...state } = await handler(input, { viewer, correlationId, log });
      await audit(details?.result ?? (state.status === "error" ? "error" : "success"), details);
      return state;
    } catch (error) {
      if (isNextControlFlow(error)) {
        // redirect() inside a handler means it finished successfully.
        await audit("success");
        throw error;
      }
      await audit("error", {
        metadata: { message: error instanceof Error ? error.message : "unknown" },
      });
      reportError(error, { action: config.name, correlationId });
      return { status: "error", message: "Something went wrong. Please try again." };
    }
  };

  action[AUDITED] = config.name;
  return action;
}

/** Helper for actions without form fields. */
export const noInput = () => ({});
