# Runbook: turn on error reporting (Sentry)

The code is already wired: `apps/web/instrumentation.ts` and `apps/worker/src/index.ts` start Sentry when `SENTRY_DSN` is set. Every event passes through the same redaction as the logs, so keys, tokens and email addresses never leave the server. Without a DSN, errors are only written to the platform logs.

1. sentry.io → create an organisation, then two projects: **Next.js** named `nexus-web`, and **Node.js** named `nexus-worker`.
2. Copy each project's **DSN** (Settings → Client Keys).
3. **Vercel** → `nexus` → Environment Variables: add `SENTRY_DSN` with the `nexus-web` DSN (Production and Preview), then redeploy.
4. **Railway** → `@nexus/worker` → Variables: add `SENTRY_DSN` with the `nexus-worker` DSN. The service restarts on its own.
5. Check it: in Sentry, _Issues_ should stay empty during normal use. A test error from the worker appears within a minute of a crash.

Add the DSNs to the provider register (`docs/provider-register/providers.md`) with today's date.
