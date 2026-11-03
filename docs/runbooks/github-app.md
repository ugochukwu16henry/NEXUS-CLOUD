# Runbook: register the Nexus GitHub App

Sprint 3 connects repositories through a **GitHub App**, not a personal token. The app is installed only on the repositories you choose. Every job gets its own token, narrowed to one repository, valid for at most an hour and never stored (threat model T08). Until the six settings below exist, Settings → Integrations shows what's missing and nothing else changes.

## 1. Create the app

GitHub → your organisation (or your account) → Settings → Developer settings → **GitHub Apps** → **New GitHub App**.

| Field                                                      | Value                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Name                                                       | `Nexus Cloud` (the slug GitHub derives, e.g. `nexus-cloud`, is `GITHUB_APP_SLUG`)                                                          |
| Homepage URL                                               | `https://nexus-theta-nine-42.vercel.app`                                                                                                   |
| Callback URL                                               | `https://nexus-theta-nine-42.vercel.app/integrations/github/setup`                                                                         |
| **Request user authorization (OAuth) during installation** | **On.** Nexus uses it to prove the installation belongs to you. Without it, connecting fails with "GitHub didn't send the details needed". |
| Expire user authorization tokens                           | On                                                                                                                                         |
| Setup URL                                                  | Leave empty (GitHub disables it when the option above is on)                                                                               |
| Webhook                                                    | Active                                                                                                                                     |
| Webhook URL                                                | `https://nexus-theta-nine-42.vercel.app/api/webhooks/github`                                                                               |
| Webhook secret                                             | A long random value, e.g. from `openssl rand -hex 32`. This is `GITHUB_WEBHOOK_SECRET`.                                                    |

**Repository permissions** (the minimum; Sprint 4 needs the write access for commits):

| Permission    | Access                |
| ------------- | --------------------- |
| Contents      | Read and write        |
| Pull requests | Read and write        |
| Checks        | Read-only             |
| Metadata      | Read-only (mandatory) |

Everything else: **No access**. Nexus narrows each sync job further, to read-only on one repository.

**Subscribe to events:** Push, Pull request, Check suite, Create, Delete. (Installation events arrive automatically.)

**Where can this app be installed?** Only on this account.

## 2. Collect the secrets

On the app's page:

- **App ID** → `GITHUB_APP_ID`
- **Client ID** → `GITHUB_APP_CLIENT_ID`
- **Generate a new client secret** → `GITHUB_APP_CLIENT_SECRET`
- **Generate a private key** downloads a `.pem` file → `GITHUB_APP_PRIVATE_KEY`. Paste the whole file, including the BEGIN and END lines. Then delete the download.

Never paste these into chat, an issue or a commit. gitleaks blocks private keys in the repository.

## 3. Add them to the hosts

**Vercel** → `nexus` → Environment Variables, **Production** (and Preview, once staging has its own app), all marked **Sensitive**:

`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`

Then redeploy. The worker (Railway) needs no GitHub secrets: it only retries stored deliveries. It does need `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`, which it already has.

## 4. Connect and import

1. Nexus → Settings → Integrations → **Connect GitHub** (asks for your authenticator code).
2. On GitHub, pick the repositories, starting with the pilot `nexus-pilot-app` (ADR 0006), and install.
3. You're sent back to Nexus, which checks that the installation is yours and shows **GitHub is connected**.
4. Open a project → **Repository** → choose the repository → **Import repository**.

Name branches and commits after the task they're for (`task/NX-12-login`, `NX-12: validate email`), and they appear on the task and the project timeline.

## Operating it

- **Health:** Settings → Integrations and each Repository tab show **Degraded** when GitHub calls fail, with the reason. "Sync now" retries.
- **Deliveries:** failed webhooks are retried automatically (30 s, 1 min, 2 min, 4 min, 8 min). After five failures they're **dead**: fix the cause, then press **Retry**.
- **Rotating secrets:** generate the new client secret or private key on GitHub, update Vercel, redeploy, then revoke the old one. For the webhook secret, change it on GitHub and in Vercel within a few minutes of each other. Deliveries rejected in between show in GitHub's "Recent deliveries" and can be redelivered.
- **Disconnecting:** uninstall the app on GitHub. Nexus marks the integration **removed** and stops applying its webhooks.

## Still to do with the real app (Sprint 3 carry-over)

The plan also calls for a **nightly contract test against the real GitHub API**, which checks that the fields Nexus reads still exist. It needs this app installed on a test repository (`nexus-pilot-app`) and the secrets above stored in a GitHub `contract-tests` environment. Until then, the recorded payloads in `packages/integrations/src/github/events.test.ts` and the local fake GitHub cover the same fields.
