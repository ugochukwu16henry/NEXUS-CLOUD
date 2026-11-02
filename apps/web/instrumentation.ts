import type { Instrumentation } from "next";

/** Starts Sentry only when NEXT_PUBLIC_SENTRY_DSN is set; every event is redacted before it is sent. */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const [Sentry, { sentryOptions }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/sentry"),
  ]);
  Sentry.init(sentryOptions);
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
