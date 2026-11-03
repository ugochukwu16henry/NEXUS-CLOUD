// Worker process (ADR 0001, 0005). From Sprint 6 it consumes the job queue and runs sandboxed agent jobs.
// Since Sprint 3 it retries GitHub webhook deliveries that the web app couldn't apply right away.
import { WORKFLOW_STATES } from "@nexus/core";
import type { Database } from "@nexus/db";
import { processDueDeliveries } from "@nexus/integrations";
import { createClient } from "@supabase/supabase-js";
import { createLogger, redact } from "@nexus/observability";
import * as Sentry from "@sentry/node";
import { AGENT_QUEUE, startBoss, type AgentJob } from "@nexus/agents/boss";
import { processAgentJob } from "./jobs";
import { startTerminalGateway } from "./terminal";

const HEARTBEAT_MS = 30_000;
const WEBHOOK_POLL_MS = 15_000;
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

// Webhook retries: deliveries that failed (or whose processing crashed) come due with backoff and
// are applied here; after five failures they wait in the owner's dead-letter view.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
let webhookPoll: NodeJS.Timeout | undefined;
if (supabaseUrl && secretKey) {
  const db = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let running = false;
  webhookPoll = setInterval(() => {
    if (running) return;
    running = true;
    processDueDeliveries(db, { batchSize: 20 })
      .then((result) => {
        if (result.processed + result.failed + result.dead > 0) {
          logger.info("webhook deliveries retried", result);
        }
      })
      .catch((error: unknown) => {
        logger.error("webhook retry pass failed", { error });
        Sentry.captureException(error);
      })
      .finally(() => {
        running = false;
      });
  }, WEBHOOK_POLL_MS);

  const port = Number(process.env.WORKER_PORT ?? 8787);
  startTerminalGateway(db, port);
  logger.info("terminal gateway listening", { port });

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    startBoss(databaseUrl)
      .then((boss) =>
        boss.work<AgentJob>(AGENT_QUEUE, async (jobs) => {
          for (const job of jobs) await processAgentJob(db, job.data);
        }),
      )
      .then(() => logger.info("agent queue started"))
      .catch((error: unknown) => {
        logger.error("agent queue failed to start", { error });
        Sentry.captureException(error);
      });
  } else {
    logger.warn("DATABASE_URL missing; agent queue is off");
  }
} else {
  logger.warn("Supabase environment missing; webhook retries are off");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    clearInterval(webhookPoll);
    logger.info("worker stopping", { signal });
    process.exit(0);
  });
}
