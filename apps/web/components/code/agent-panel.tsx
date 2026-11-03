import { randomUUID } from "node:crypto";
import { AgentRefresh } from "@/components/code/agent-refresh";
import { ActionForm } from "@/components/ui/action-form";
import { TextField, buttonSecondary } from "@/components/ui/fields";
import { newIdempotencyKey } from "@/lib/agents/idempotency";
import { getLatestAgentRun, listAgentEvents, listPendingCommands } from "@/lib/agents/queries";
import {
  approvePlan,
  cancelAgent,
  decideCommand,
  planAgent,
} from "@/app/(cockpit)/projects/[projectId]/agent-actions";

const OPEN = new Set(["queued", "running", "waiting_approval"]);
const WORKING = new Set(["queued", "running"]);

/** Planner, coder status, command approvals and cancel. Used on the task and the code page. */
export async function AgentPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  const run = await getLatestAgentRun(taskId);
  const [events, pending] = run
    ? await Promise.all([listAgentEvents(run.id), listPendingCommands(run.id)])
    : [[], []];
  const key = newIdempotencyKey();

  return (
    <section aria-labelledby="agent-heading" className="space-y-3">
      <h2 id="agent-heading" className="text-base font-semibold">
        Agent
      </h2>
      <p className="text-sm text-nx-muted">
        The planner proposes a small task graph. Approving it lets the coder work on this task's
        files in a sandbox; its diff lands in the change set. Commands on the safe list run;
        anything else waits here for you.
      </p>
      {run && WORKING.has(run.status) && <AgentRefresh />}
      {run && (
        <p className="text-sm">
          <span className="text-nx-muted">Latest run ({run.kind}):</span>{" "}
          {run.status.replaceAll("_", " ")}
          {run.error ? ` — ${run.error}` : ""}
        </p>
      )}
      {events.length > 0 && (
        <ul aria-label="Agent activity" className="space-y-1 text-sm">
          {events.map((event) => (
            <li key={event.id}>{event.summary}</li>
          ))}
        </ul>
      )}
      <ActionForm action={planAgent} submitLabel="Plan" resetOnSuccess>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="idempotencyKey" value={run ? randomUUID() : key} />
        <TextField
          name="purpose"
          label="What should the agent do?"
          defaultValue={run?.purpose ?? ""}
          required
          maxLength={4000}
        />
      </ActionForm>
      {run?.status === "waiting_approval" && run.kind === "planner" && (
        <ActionForm action={approvePlan} submitLabel="Approve plan" announceSuccess>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="runId" value={run.id} />
        </ActionForm>
      )}
      {pending.map((command) => (
        <div key={command.id} className="space-y-2 rounded border border-nx-border p-3 text-sm">
          <p>
            Waiting for approval: <span className="font-mono">{command.command}</span>
          </p>
          <div className="flex gap-2">
            {(["approved", "denied"] as const).map((decision) => (
              <ActionForm
                key={decision}
                action={decideCommand}
                submitLabel={decision === "approved" ? "Approve command" : "Deny command"}
                buttonClassName={buttonSecondary}
                announceSuccess
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name="approvalId" value={command.id} />
                <input type="hidden" name="decision" value={decision} />
              </ActionForm>
            ))}
          </div>
        </div>
      ))}
      {run && OPEN.has(run.status) && (
        <ActionForm
          action={cancelAgent}
          submitLabel="Cancel run"
          buttonClassName={buttonSecondary}
          announceSuccess
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="runId" value={run.id} />
        </ActionForm>
      )}
    </section>
  );
}
