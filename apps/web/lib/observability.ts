import "server-only";
import { createLogger, redact } from "@nexus/observability";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

export const CORRELATION_HEADER = "x-correlation-id";

export const logger = createLogger({
  service: "web",
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
});

/** Correlation ID set by the proxy for this request; a fresh one if called outside a request. */
export async function getCorrelationId(): Promise<string> {
  try {
    return (await headers()).get(CORRELATION_HEADER) ?? crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

export async function requestLogger() {
  return logger.child({ correlationId: await getCorrelationId() });
}

/** Logs the error and, when SENTRY_DSN is set, sends a redacted copy to Sentry. */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  logger.error("unhandled error", { error, ...context });
  Sentry.captureException(error, { extra: redact(context) as Record<string, unknown> });
}
