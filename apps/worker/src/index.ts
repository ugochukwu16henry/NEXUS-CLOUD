// Worker process (ADR 0001, 0005). From Sprint 6 it consumes the job queue and runs sandboxed agent jobs.
// In Sprint 0 it only proves the build, env loading and graceful shutdown.
import { WORKFLOW_STATES } from "@nexus/core";

const HEARTBEAT_MS = 30_000;

function log(message: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), service: "worker", message, ...fields }),
  );
}

log("worker started", { workflowStates: WORKFLOW_STATES.length });
const heartbeat = setInterval(() => log("heartbeat"), HEARTBEAT_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    log("worker stopping", { signal });
    process.exit(0);
  });
}
