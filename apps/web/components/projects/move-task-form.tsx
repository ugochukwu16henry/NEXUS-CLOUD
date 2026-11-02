"use client";

import { STATE_LABELS, nextStates, type WorkflowState } from "@nexus/core";
import { useActionState, useId, useState } from "react";
import { moveTask } from "@/app/(cockpit)/projects/[projectId]/tasks/actions";
import { FormMessage } from "@/components/form-message";
import { announce } from "@/components/ui/announcer";
import { IDLE_STATE, type ActionState } from "@/lib/action-state";

/** On success the card moves column and re-mounts, so the confirmation goes to the shared announcer. */
async function moveAndAnnounce(previous: ActionState, formData: FormData) {
  const result = await moveTask(previous, formData);
  if (result.status === "success" && result.message) {
    announce(result.message);
    return IDLE_STATE;
  }
  return result;
}

/**
 * Keyboard-friendly way to move a task: pick the next state and confirm. This is the board's
 * accessible alternative to drag and drop; the result is announced to screen readers.
 */
export function MoveTaskForm({
  projectId,
  taskId,
  taskRef,
  state,
  version,
  returnTo,
}: {
  projectId: string;
  taskId: string;
  taskRef: number;
  state: WorkflowState;
  version: number;
  returnTo: string;
}) {
  const [result, move, pending] = useActionState(moveAndAnnounce, IDLE_STATE);
  const options = nextStates(state);
  const [chosen, setChosen] = useState<WorkflowState | "">(options[0] ?? "");
  // After a move the options change; fall back to the first valid one.
  const target = chosen && options.includes(chosen) ? chosen : (options[0] ?? "");
  const id = useId();

  if (options.length === 0) return <p className="text-xs text-nx-muted">No further moves.</p>;

  return (
    <form action={move} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-to`} className="sr-only">
            Move NX-{taskRef} to
          </label>
          <select
            id={`${id}-to`}
            name="to"
            value={target}
            onChange={(event) => setChosen(event.target.value as WorkflowState)}
            className="w-full rounded border border-nx-border bg-nx-bg px-2 py-1 text-xs"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-nx-border px-2 py-1 text-xs disabled:opacity-60"
          aria-label={`Move NX-${taskRef}`}
        >
          Move
        </button>
      </div>
      {target === "blocked" && (
        <div>
          <label htmlFor={`${id}-reason`} className="block text-xs text-nx-muted">
            What is blocking it?
          </label>
          <input
            id={`${id}-reason`}
            name="blockedReason"
            required
            maxLength={500}
            className="w-full rounded border border-nx-border bg-nx-bg px-2 py-1 text-xs"
          />
        </div>
      )}
      <FormMessage state={result} />
    </form>
  );
}
