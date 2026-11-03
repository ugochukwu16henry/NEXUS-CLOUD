# Agents and the sandbox

Sprint 6 runs the planner and the coder in the worker, on the task's own files in a sandbox (ADR 0019). Local development uses recorded models and the recorded sandbox, so nothing is spent or executed.

## Local

1. `supabase start`
2. `pnpm env:local` so `NEXUS_AGENT_FIXTURE=1`, `DATABASE_URL` and `WORKER_WS_URL` are written.
3. `pnpm dev` starts the web app and the worker. The terminal gateway listens on `ws://127.0.0.1:8787` (`/health` answers over HTTP).

The worker picks the recorded sandbox when the fixture flag is on. To try real containers locally, set `NEXUS_SANDBOX_DRIVER=docker` for the worker (Docker Desktop running; the first run pulls `node:24-bookworm-slim`).

## A run, end to end

1. Import the repository, open the task on the Code tab and start a branch.
2. On the task, describe the work and choose **Plan**. The panel refreshes while the worker writes the plan.
3. **Approve plan** (authenticator). The same run continues as the coder in a sandbox holding the repository at the branch's base commit plus the task's change set.
4. Safe-list commands run. Anything else shows **Waiting for approval** with Approve/Deny. Approve resumes the run; Deny stops it. Commands with shell operators, on the denylist, or naming a host outside the allowlist are refused without asking.
5. When the coder finishes, its files are in the task's change set (Code → Changes), with secrets held back. The task moves from In Progress to Agent Complete. Review and commit from the Code tab as usual.

Cancel stops a run that is queued, running, or waiting. A run that hits its step limit or budget keeps what it changed so far and says which setting to raise.

## Talking to the agent

Every project has its own **Agent** chat (project tab **Agent**, or **Agents** in the menu, which lists each project's conversation, newest first). It is one conversation per project, saved in the Nexus database, so opening a project again shows everything said before; another project never sees it.

- **Type or talk.** Tap the **mic**: Chrome, Edge and Safari turn speech into text in the browser, free and live. Elsewhere it records up to five minutes and the server transcribes it with Groq Whisper (free tier; `GROQ_API_KEY`), falling back to OpenAI. Recordings are not stored.
- **+ adds files, a whole folder, or a .zip** (on a phone: zip the folder first). They belong to this project, keep their folders, skip `node_modules` and the like, and go with the next message. Secrets are refused.
- **Replies** go through the project's models and budgets (Project → Settings → Models); pick a model next to the mic, or leave it on Automatic. The agent sees the last 30 messages and the text of the files sent with the newest one; older files are listed by name. Each reply shows its model and cost.
- **Make it a task** under one of your messages creates a task and queues its plan; open the task to approve the plan, and the coder works in a sandbox on that task's own branch.

A task's own Agent panel (task page, or the Code tab with a task) has the same mic and + for that one task.

## Terminal

Opening the terminal asks for the authenticator. The ticket lasts 60 seconds and works once. The shell starts in a sandbox with the task's files; what you change is saved to the change set every 15 seconds and when you close it (without a branch, nothing is saved, and the shell says so). Commands are audited with secrets redacted; output is not stored. The idle timeout and the number of open terminals per project are in Project → Settings → Workspace.

## Production

Set on the worker (Railway): `E2B_API_KEY` (marked secret), `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, the GitHub App values (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`) and at least one model provider key. Optional: `E2B_TEMPLATE` for a custom image. Set `WORKER_WS_URL` on the web app (Vercel) to the worker's public `wss://` address. Never set `NEXUS_AGENT_FIXTURE` or `NEXUS_SANDBOX_DRIVER=recorded` on a hosted environment (both are refused unless Supabase is local).

Manual check after the first deploy: open a terminal on a task, run `node -v` and `curl -sI https://registry.npmjs.org` (works) and `curl -sI https://example.com` (refused), edit a file, close the terminal, and see the file under Changes.

## Sandbox tests

`pnpm --filter @nexus/agents test:sandbox` with `NEXUS_SANDBOX_TESTS=1` runs the Docker driver for real: non-root, no egress, timeouts, process cap, disk cap, and files in and out of a session. It needs Docker and pulls `node:24-bookworm-slim`.

## What is not claimed

The 15-request golden set has not been run against a live model, and the E2B driver has not run against the live service from this repository (it needs a paid key). There is no acceptance rate to publish until a provider account is funded. Quality gates that move a task to Needs Human Review arrive in Sprint 7.
