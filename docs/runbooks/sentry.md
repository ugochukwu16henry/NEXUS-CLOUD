# Runbook: turn on error reporting (Sentry)

The code is wired. The web app starts Sentry when `NEXT_PUBLIC_SENTRY_DSN` is set: on the server in `apps/web/instrumentation.ts`, in the browser in `apps/web/instrumentation-client.ts`, both using the options in `apps/web/lib/sentry.ts`. The worker (`apps/worker/src/index.ts`) uses `SENTRY_DSN`. Every event passes through the same redaction as the logs, and user data collection is off, so keys, tokens and email addresses never leave the app. Tracing and Session Replay are off. Without a DSN, errors are only written to the platform logs.

- **Organisation:** `zentrix-software-solutions` · **Project:** `nexus-cloud` (Next.js), set up with `@sentry/wizard` on 2026-11-03
- **Browser events** go to `/monitoring` on our own domain, which forwards them to Sentry. That keeps the CSP at `connect-src 'self'` and survives ad blockers. `proxy.ts` skips this route so signed-out pages can report too.
- **A DSN is not a secret.** It can only submit events, so it may appear in the browser bundle. The **auth token** (`sntrys_…`) is a secret.

## Turn it on

1. Sentry → `nexus-cloud` → Settings → Client Keys: copy the **DSN**.
2. **Vercel** → `nexus` → Environment Variables, for Production and Preview:
   - `NEXT_PUBLIC_SENTRY_DSN`: the DSN
   - `SENTRY_AUTH_TOKEN`: the token the wizard printed (or a new one from Sentry → Settings → Auth Tokens), marked **Sensitive**. Builds then upload source maps and delete them from the output, so they are never served.
   - Redeploy: `NEXT_PUBLIC_*` values are built into the bundle.
3. **Railway** → `@nexus/worker` → Variables: add `SENTRY_DSN`. The same DSN works; a separate Node.js project keeps worker issues apart. The service restarts on its own.
4. Check it: _Issues_ should stay empty during normal use. An error in the app appears within a minute.

## Local development

Leave `NEXT_PUBLIC_SENTRY_DSN` unset locally and in CI, so tests never send events. The wizard wrote `apps/web/.env.sentry-build-plugin` with an auth token for local source-map uploads. It is gitignored (`.env.*`) and must never be committed; delete it if you don't need local uploads.
