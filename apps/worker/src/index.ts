// Worker process (ADR 0001, 0005). From Sprint 6 it consumes the job queue and runs sandboxed agent jobs.
// Until then it proves the build, structured logging, error reporting and graceful shutdown.
import { WORKFLOW_STATES } from "@nexus/core";
import { createLogger, redact } from "@nexus/observability";
import * as Sentry from "@sentry/node";

const HEARTBEAT_MS = 30_000;
const logger = createLogger({ service: "worker" });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    beforeSend: (event) => redact(event) as typeof event,
  });
}

function fail(error: unknown, origin: string) {
  logger.error("worker crashed", { error, origin });
  Sentry.captureException(error);
  void Sentry.flush(2_000).finally(() => process.exit(1));
}

process.on("uncaughtException", (error) => fail(error, "uncaughtException"));
process.on("unhandledRejection", (error) => fail(error, "unhandledRejection"));

logger.info("worker started", { workflowStates: WORKFLOW_STATES.length });
const heartbeat = setInterval(() => logger.debug("heartbeat"), HEARTBEAT_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    logger.info("worker stopping", { signal });
    process.exit(0);
  });
}
