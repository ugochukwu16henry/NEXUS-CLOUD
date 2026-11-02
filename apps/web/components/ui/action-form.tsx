"use client";

import { useActionState, type ReactNode } from "react";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE, type ActionState } from "@/lib/action-state";
import { announce } from "./announcer";
import { buttonPrimary } from "./fields";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action, with a status message. When `version` is given, the form keeps
 * a hidden version field current after each save, so repeated saves don't trip the conflict check.
 */
export function ActionForm({
  action,
  submitLabel,
  version,
  children,
  className = "space-y-4",
  buttonClassName = buttonPrimary,
  resetOnSuccess = false,
  announceSuccess = false,
}: {
  action: Action;
  submitLabel: string;
  version?: number;
  children?: ReactNode;
  className?: string;
  buttonClassName?: string;
  resetOnSuccess?: boolean;
  /**
   * Send the success message to the app-wide announcer instead of showing it inline. Use it for
   * forms that disappear once they succeed (e.g. an "Approve" button), which would lose the message.
   */
  announceSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData);
      if (announceSuccess && result.status === "success" && result.message) {
        announce(result.message);
        return IDLE_STATE;
      }
      return result;
    },
    IDLE_STATE,
  );
  const currentVersion = state.data?.version ?? version;

  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state.status === "success" ? state.message : undefined}
    >
      {children}
      {currentVersion !== undefined && (
        <input type="hidden" name="version" value={currentVersion} />
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClassName}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
