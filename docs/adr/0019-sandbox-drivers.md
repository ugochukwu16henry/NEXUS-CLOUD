# ADR 0019: Sandbox drivers: a managed microVM service in production, Docker locally

- **Status:** Accepted
- **Date:** 2026-11-03
- **Decider:** Henry Ugochukwu (owner)

## Context

ADR 0005 put agent commands and the terminal in an ephemeral sandbox. Sprint 6 built it as `docker run` from the worker. The worker runs on Railway, which gives services no Docker daemon, so production had no sandbox at all. The first container also could not build anything: a `busybox` image, a `noexec` work folder, no network and no project files.

The owner chose a managed service for production (2026-11-03), with Docker kept for laptops and CI.

## Decision

1. **One interface, three drivers** (`packages/agents/src/driver.ts`). A sandbox session can write files, read a file, hash every file, run a command with a timeout, open an interactive shell and close. The worker never knows which driver it has:
   - **E2B** (`@nexus/agents/e2b`, SDK pinned at 2.56.0): a Firecracker microVM per session, created on demand and killed when the run or terminal ends. Egress is denied except `registry.npmjs.org`, `github.com`, `codeload.github.com` and `objects.githubusercontent.com` (HTTP and HTTPS only; every other port and protocol is denied). The shell is a real pseudo-terminal. Chosen when `E2B_API_KEY` is set. `E2B_TEMPLATE` picks a custom image (for another Node version).
   - **Docker** (`createDockerDriver`): `node:<major>-bookworm-slim`, one long-lived container per session, non-root (1000), every capability dropped, `no-new-privileges`, read-only root, the work folder and home are size-capped tmpfs, CPU, memory and process limits, `--init`. No network by default; `NEXUS_SANDBOX_DOCKER_NETWORK=bridge` turns plain network on (Docker cannot filter by host, so this is for the owner's own machine only).
   - **Recorded** (local tests only, refused unless Supabase is on localhost): files in memory, commands report that they were recorded. E2E uses it so nothing executes or is spent.
     `NEXUS_SANDBOX_DRIVER` picks one explicitly.
2. **The sandbox holds the task's files.** The worker downloads the repository at the change set's base commit as one tarball (GitHub's `tarball` endpoint, installation token narrowed to that repository and read-only), skips the owner's skipped folders and files above the file-size limit, lays the change set's own edits on top and writes the result into the sandbox. Nothing from the worker's own disk or environment goes in; the project's plain (non-secret) environment values are passed to commands.
3. **Changes come back as change-set rows.** After a coding run, every 15 seconds in a terminal, and when the terminal closes, the worker hashes the sandbox files and compares them with what it put in. Edited and new files are stored and written as `add`/`modify`, removed repository files as `delete`, and a file back to its committed contents drops out of the change set. Anything that looks like a secret is held back from commits, exactly as an upload is (ADR 0016). Commits still happen only from the Code tab (ADR 0017).
4. **The coding agent uses the owner's settings.** Approving a plan queues the same run as the coder. It works in one JSON action per model reply (list, read, write, run a command, finish) through the project's gateway: routes, allowed providers, fallback, the per-run budget, the project budget and the monthly cap (Sprint 5, ADR 0018). Every command passes the policy. Safe-list commands run; anything else pauses the run with its conversation saved (server-only column) until the owner approves or denies it on the task page. The step limit is `agent_max_iterations` in Workspace settings.

## Consequences

- Production needs `E2B_API_KEY` on the worker (Railway). Without it the worker falls back to Docker, which Railway cannot run, so agent runs and terminals fail with "The sandbox could not start".
- Each run and terminal starts a fresh sandbox: `node_modules` is not kept between a paused run and its resumption. The install command runs again when the agent needs it.
- The managed service sees the task's code while a session is open. It is a processor of the owner's code, like GitHub and the model providers; the threat model lists it (T14, T32).
- Cost: E2B bills per sandbox-second. Sessions end with the run or the terminal, and a terminal closes after the owner's idle timeout.
- The E2B driver has no automated test here (it needs a paid key); its behaviour is covered by the same interface tests as the others, and the runbook has a manual check.
