import type { Instrumentation } from "next";

/** Starts Sentry only when SENTRY_DSN is set; every event is redacted before it leaves the server. */
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const [Sentry, { redact }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@nexus/observability"),
  ]);
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend: (event) => redact(event) as typeof event,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const [{ createLogger }, Sentry] = await Promise.all([
    import("@nexus/observability"),
    import("@sentry/nextjs"),
  ]);
  createLogger({ service: "web" }).error("request failed", {
    error,
    path: request.path,
    method: request.method,
    correlationId: request.headers["x-correlation-id"],
    routeType: context.routeType,
  });
  Sentry.captureRequestError(error, request, context);
};
