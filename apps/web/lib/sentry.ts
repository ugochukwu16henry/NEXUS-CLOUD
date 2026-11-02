import { redact } from "@nexus/observability";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Options shared by the server and browser Sentry clients. The DSN is public by design (it can only
 * submit events), so the web app reads it from NEXT_PUBLIC_SENTRY_DSN; without it Sentry stays off.
 * Every event goes through the same redaction as the logs (threat model T21).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  // Collect nothing that identifies a user; anything else that slips through is redacted below.
  dataCollection: {
    userInfo: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    httpBodies: [],
    httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },
  beforeSend: (event: ErrorEvent) => redact(event) as ErrorEvent,
};
