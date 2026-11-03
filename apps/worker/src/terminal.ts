import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { redactString } from "@nexus/observability";
import { DEFAULT_SANDBOX_LIMITS, SANDBOX_EGRESS, type SandboxSession } from "@nexus/agents";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@nexus/db";
import { WebSocketServer, type WebSocket } from "ws";
import { sandboxDriver } from "./runtime";
import { loadTaskWorkspace, syncBack, type TaskWorkspace } from "./workspace";

type Db = SupabaseClient<Database>;

const SYNC_MS = 15_000;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * One shell per ticket, in a sandbox holding the task's files (ADR 0019). The ticket is single-use
 * and short-lived. Output stays on the socket; commands are audited with secrets redacted. What the
 * shell changes is saved to the task's change set every few seconds and when the shell closes.
 */
export function startTerminalGateway(db: Db, port: number): void {
  const server = createServer((request, response) => {
    // Plain HTTP only answers the health check; the shell is a WebSocket upgrade.
    response.writeHead(request.url === "/health" ? 200 : 426, { "Content-Type": "text/plain" });
    response.end(request.url === "/health" ? "ok" : "");
  });
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
  wss.on("connection", (socket, request) => {
    void attach(db, socket, request).catch(() => socket.close(1011));
  });
  server.listen(port);
}

async function attach(db: Db, socket: WebSocket, request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const token = url.searchParams.get("ticket") ?? "";
  const { data: session } = await db
    .from("sandbox_sessions")
    .select(
      "id, project_id, task_id, expires_at, connected_at, closed_at, idle_seconds, created_by",
    )
    .eq("ticket_hash", hash(token))
    .maybeSingle();
  const expired = !session || Date.parse(session.expires_at) <= Date.now();
  if (!session || session.connected_at || session.closed_at || expired) {
    socket.close(4401);
    return;
  }
  const { data: claimed } = await db
    .from("sandbox_sessions")
    .update({ connected_at: new Date().toISOString() })
    .eq("id", session.id)
    .is("connected_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    socket.close(4401);
    return;
  }

  // Input typed before the sandbox is ready is kept and replayed.
  const early: string[] = [];
  const buffer = (data: unknown) => early.push(String(data));
  socket.on("message", buffer);
  let closedEarly = false;
  socket.once("close", () => {
    closedEarly = true;
  });

  const markClosed = () =>
    db
      .from("sandbox_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("closed_at", null);

  const { data: project } = await db
    .from("projects")
    .select("workspace_id")
    .eq("id", session.project_id)
    .maybeSingle();

  socket.send("Preparing the sandbox with this task's files…\r\n");
  let workspace: TaskWorkspace | null = null;
  let sandbox: SandboxSession;
  try {
    if (session.task_id) {
      workspace = await loadTaskWorkspace(db, session.project_id, session.task_id);
      const { count } = await db
        .from("sandbox_sessions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", session.project_id)
        .eq("kind", "terminal")
        .not("connected_at", "is", null)
        .is("closed_at", null);
      if ((count ?? 0) > workspace.settings.terminalMaxSessions) {
        socket.send(
          "Too many terminals are open for this project. Close one, or raise the limit in Project → Settings → Workspace.\r\n",
        );
        await markClosed();
        socket.close(4429);
        return;
      }
    }
    const driver = await sandboxDriver();
    sandbox = await driver.open({
      limits: { ...DEFAULT_SANDBOX_LIMITS, timeoutSeconds: 60 * 60 },
      nodeMajor: workspace?.settings.nodeMajor ?? 24,
      allowlist: [...SANDBOX_EGRESS],
      label: `terminal-${session.id}`,
    });
    if (workspace) await sandbox.writeFiles(workspace.snapshot.files);
  } catch {
    socket.send("The sandbox could not start.\r\n");
    await markClosed();
    socket.close(1011);
    return;
  }
  if (closedEarly) {
    await sandbox.close();
    await markClosed();
    return;
  }
  if (workspace && !workspace.changeset) {
    socket.send(
      "No branch is open for this task, so changes here are not saved. Start one on the Code tab.\r\n",
    );
  }

  let syncing: Promise<void> = Promise.resolve();
  const save = (final: boolean) => {
    if (!workspace?.changeset) return syncing;
    const ws = workspace;
    syncing = syncing
      .then(async () => {
        const result = await syncBack(db, ws, sandbox);
        if (!final && result.paths.length > 0 && socket.readyState === socket.OPEN) {
          socket.send(
            `\r\n[saved to the change set: ${result.paths.slice(0, 5).join(", ")}${result.paths.length > 5 ? " …" : ""}]\r\n`,
          );
        }
      })
      .catch(() => undefined);
    return syncing;
  };
  const periodic = setInterval(() => void save(false), SYNC_MS);

  let idle: NodeJS.Timeout | undefined;
  let line = "";
  const bump = () => {
    clearTimeout(idle);
    const seconds = workspace?.settings.terminalIdleSeconds ?? session.idle_seconds;
    idle = setTimeout(() => socket.close(4408), seconds * 1000);
  };
  bump();

  const shell = await sandbox.shell({
    cols: 80,
    rows: 24,
    env: workspace?.settings.plainEnv ?? {},
    onData: (chunk) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk);
    },
    onExit: () => socket.close(),
  });

  const input = (data: unknown) => {
    bump();
    const text = String(data);
    shell.write(text);
    line += text;
    if (!/[\r\n]/.test(line)) return;
    const command = redactString(line.trim()).slice(0, 500);
    line = "";
    if (!project || !command) return;
    void db.from("audit_events").insert({
      workspace_id: project.workspace_id,
      project_id: session.project_id,
      actor_id: session.created_by,
      actor_type: session.created_by ? "user" : "system",
      action: "terminal.command",
      target_type: "sandbox_session",
      target_id: session.id,
      result: "success",
      correlation_id: randomUUID(),
      metadata: { command },
    });
  };
  socket.off("message", buffer);
  socket.on("message", input);
  for (const data of early) input(data);

  socket.on("close", () => {
    clearTimeout(idle);
    clearInterval(periodic);
    void (async () => {
      await shell.kill();
      await save(true);
      await sandbox.close();
      await markClosed();
    })();
  });
}
