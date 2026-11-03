"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/form-message";
import { buttonSecondary } from "@/components/ui/fields";
import { IDLE_STATE, type ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Asks for a one-minute terminal ticket (MFA) and attaches xterm.js to the worker.
 * Output is not stored. A stolen or expired ticket is refused by the worker.
 */
export function TerminalPanel({
  action,
  projectId,
  taskId,
  workerUrl,
}: {
  action: Action;
  projectId: string;
  taskId: string;
  workerUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const host = useRef<HTMLDivElement>(null);
  const ticket = state.data?.ticket;

  useEffect(() => {
    if (!ticket || !workerUrl || !host.current) return;
    const element = host.current;
    let closed = false;
    let socket: WebSocket | undefined;
    let term:
      | {
          dispose: () => void;
          write: (data: string) => void;
          onData: (cb: (data: string) => void) => void;
        }
      | undefined;
    void (async () => {
      const { Terminal } = await import("@xterm/xterm");
      await import("@xterm/xterm/css/xterm.css");
      if (closed) return;
      const next = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        theme: { background: "#0b0d10" },
      });
      next.open(element);
      term = next;
      const url = new URL(workerUrl);
      url.searchParams.set("ticket", ticket);
      socket = new WebSocket(url);
      socket.addEventListener("message", (event) => {
        next.write(typeof event.data === "string" ? event.data : "");
      });
      next.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(data);
      });
    })();
    return () => {
      closed = true;
      socket?.close();
      term?.dispose();
    };
  }, [ticket, workerUrl]);

  return (
    <section
      aria-labelledby="terminal-heading"
      className="space-y-2 border-t border-nx-border px-4 py-3"
    >
      <h2 id="terminal-heading" className="text-sm font-semibold">
        Terminal
      </h2>
      <p className="text-xs text-nx-muted">
        The shell runs in this task's sandbox, not on the web server. Opening it needs the
        authenticator. The ticket lasts 60 seconds and works once.
      </p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <button type="submit" disabled={pending} className={buttonSecondary}>
          {pending ? "Opening…" : "Open terminal"}
        </button>
      </form>
      <FormMessage state={state} />
      {!workerUrl && (
        <p className="text-xs text-nx-muted">Set WORKER_WS_URL to connect the shell.</p>
      )}
      <div ref={host} className="h-48 overflow-hidden rounded border border-nx-border" />
    </section>
  );
}
