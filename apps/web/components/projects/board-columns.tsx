"use client";

import { STATE_LABELS, nextStates, type WorkflowState } from "@nexus/core";
import Link from "next/link";
import { useRef, useState, useTransition, type DragEvent } from "react";
import { moveTask } from "@/app/(cockpit)/projects/[projectId]/tasks/actions";
import { announce } from "@/components/ui/announcer";
import { IDLE_STATE } from "@/lib/action-state";
import { MoveTaskForm } from "./move-task-form";

export type BoardCard = {
  id: string;
  ref: number;
  title: string;
  state: WorkflowState;
  version: number;
  assignee: string | null;
  assigneeType: string;
  blockedReason: string | null;
  waitingOn: number[];
};

export type BoardColumn = {
  state: WorkflowState;
  total: number;
  cards: BoardCard[];
  /** Link that shows every card in this column, when some are hidden. */
  showAllHref: string | null;
};

/**
 * The board's columns. Cards can be dragged to a column the workflow allows next; every card also
 * keeps its "Move" control, which is the keyboard and screen-reader way to do the same thing.
 */
export function BoardColumns({
  projectId,
  columns,
  returnTo,
}: {
  projectId: string;
  columns: BoardColumn[];
  returnTo: string;
}) {
  const [dragged, setDragged] = useState<BoardCard | null>(null);
  const [overColumn, setOverColumn] = useState<WorkflowState | null>(null);
  const [error, setError] = useState("");
  const [blocking, setBlocking] = useState<BoardCard | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonDialog = useRef<HTMLDialogElement>(null);

  const allowed = (card: BoardCard | null, to: WorkflowState) =>
    !!card && nextStates(card.state).includes(to);

  function submit(card: BoardCard, to: WorkflowState, blockedReason = "") {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("taskId", card.id);
    formData.set("version", String(card.version));
    formData.set("to", to);
    formData.set("returnTo", returnTo);
    if (blockedReason) formData.set("blockedReason", blockedReason);
    startTransition(async () => {
      const result = await moveTask(IDLE_STATE, formData);
      if (result.status === "success") {
        setError("");
        if (result.message) announce(result.message);
      } else {
        setError(result.message ?? "Could not move the task.");
      }
    });
  }

  function onDrop(event: DragEvent, to: WorkflowState) {
    event.preventDefault();
    setOverColumn(null);
    const card = dragged;
    setDragged(null);
    if (!card || card.state === to) return;
    if (!allowed(card, to)) {
      setError(
        `NX-${card.ref} can't move from ${STATE_LABELS[card.state]} to ${STATE_LABELS[to]}.`,
      );
      return;
    }
    if (to === "blocked") {
      setBlocking(card);
      reasonDialog.current?.showModal();
      return;
    }
    submit(card, to);
  }

  return (
    <>
      <p className="text-xs text-nx-muted">
        Drag a card to the next column, or use its Move control. Columns show up to 50 cards.
      </p>
      {error && (
        <p role="alert" className="text-sm text-nx-danger">
          {error}
        </p>
      )}
      <div
        role="region"
        aria-label="Workflow board, scrolls sideways"
        aria-busy={pending}
        tabIndex={0}
        // On a phone each column fills most of the screen and swipes into place.
        className="snap-x snap-mandatory overflow-x-auto pb-2 sm:snap-none"
      >
        <ol className="flex gap-3" aria-label="Workflow columns">
          {columns.map((column) => {
            const label = STATE_LABELS[column.state];
            const canDrop = allowed(dragged, column.state);
            return (
              <li
                key={column.state}
                data-column={column.state}
                onDragOver={(event) => {
                  if (!canDrop) return;
                  event.preventDefault();
                  setOverColumn(column.state);
                }}
                onDragLeave={() =>
                  setOverColumn((current) => (current === column.state ? null : current))
                }
                onDrop={(event) => onDrop(event, column.state)}
                className={`w-[85vw] max-w-xs shrink-0 snap-start rounded-md p-1 sm:w-64 ${
                  dragged && canDrop ? "outline-dashed outline-1 outline-nx-teal/60" : ""
                } ${overColumn === column.state ? "bg-nx-teal/10" : ""}`}
              >
                <h2 className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-nx-muted">
                  <span>{label}</span>
                  <span>{column.total}</span>
                </h2>
                <ul className="space-y-2" aria-label={`${label} tasks`}>
                  {column.cards.map((card) => (
                    <li
                      key={card.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", card.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragged(card);
                        setError("");
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setOverColumn(null);
                      }}
                      className={`cursor-grab space-y-2 rounded-md border bg-nx-raised p-3 active:cursor-grabbing ${
                        card.state === "blocked" ? "border-nx-danger/60" : "border-nx-border"
                      } ${dragged?.id === card.id ? "opacity-50" : ""}`}
                    >
                      <div>
                        <span className="font-mono text-xs text-nx-muted">NX-{card.ref}</span>
                        <Link
                          href={`/projects/${projectId}/tasks/${card.id}`}
                          draggable={false}
                          className="block text-sm font-medium hover:underline"
                        >
                          {card.title}
                        </Link>
                      </div>
                      {card.assignee && (
                        <p className="text-xs text-nx-muted">
                          {card.assigneeType === "agent" ? "Agent: " : ""}
                          {card.assignee}
                        </p>
                      )}
                      {card.blockedReason && (
                        <p className="text-xs text-nx-danger">{card.blockedReason}</p>
                      )}
                      {card.waitingOn.length > 0 && (
                        <p className="text-xs text-nx-warn">
                          Waiting on {card.waitingOn.map((ref) => `NX-${ref}`).join(", ")}
                        </p>
                      )}
                      <MoveTaskForm
                        projectId={projectId}
                        taskId={card.id}
                        taskRef={card.ref}
                        state={card.state}
                        version={card.version}
                        returnTo={returnTo}
                      />
                    </li>
                  ))}
                </ul>
                {column.showAllHref && (
                  <Link
                    href={column.showAllHref}
                    className="mt-2 block text-xs text-nx-blue underline"
                  >
                    Show all {column.total} in {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <dialog
        ref={reasonDialog}
        aria-labelledby="block-reason-title"
        onClose={() => setBlocking(null)}
        className="m-auto w-full max-w-sm rounded-lg border border-nx-border bg-nx-surface p-5 text-nx-text backdrop:bg-black/60"
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            const reason = new FormData(event.currentTarget).get("reason");
            if (blocking && typeof reason === "string" && reason.trim())
              submit(blocking, "blocked", reason);
          }}
          className="space-y-3"
        >
          <h2 id="block-reason-title" className="text-base font-semibold">
            Block NX-{blocking?.ref}
          </h2>
          <label htmlFor="block-reason" className="block text-sm">
            Reason for blocking NX-{blocking?.ref}
          </label>
          <input
            id="block-reason"
            name="reason"
            required
            maxLength={500}
            className="w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => reasonDialog.current?.close()}
              className="rounded-md border border-nx-border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-nx-teal px-3 py-1.5 text-sm font-semibold text-nx-bg"
            >
              Block task
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
