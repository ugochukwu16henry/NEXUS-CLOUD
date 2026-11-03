# ADR 0016: Uploads, terminal and agent panel in the workspace

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decider:** Henry Ugochukwu (owner)

## Context

The owner wants the cockpit to work like a desktop IDE (VS Code with an AI side panel) inside the browser:

1. **Upload many files and whole folders** into a project, not one file at a time, and **pictures** as well (screenshots, designs, logos).
2. **A terminal** to run commands directly (install, build, test, git).
3. **An agent panel**, separate from the terminal, where the owner asks an AI agent to do the work. Both act on the same project.
4. **Settings** for all of this.

ADR 0005 already decided that code never runs on the web server: builds, tests and file work happen in ephemeral, locked-down sandbox containers on the worker. This ADR applies that rule to uploads and the terminal.

## Decision

### 1. Uploads (Sprint 4)

Two kinds, chosen by where the upload goes:

|                           | **Into the code** (Repository tab, editor)                                                                                                           | **As attachments** (tasks, requirements, agent panel)                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What                      | Files and whole folders, with their folder structure                                                                                                 | Images, PDFs, text and spreadsheets                                                        |
| How                       | Drag and drop or a picker (files, or a folder via the browser's folder picker); many at once, with a progress list                                   | Drag and drop, picker, or paste a screenshot                                               |
| Where it lands            | The task's worktree on its task branch, as uncommitted changes in the diff. It is committed through the normal commit flow, never straight to `main` | A private storage bucket per project (Supabase Storage), recorded in the `artifacts` table |
| Default limits (Settings) | 25 MB per file, 200 MB and 1,000 files per upload                                                                                                    | 20 MB per file                                                                             |

Every upload is checked on the server before it is kept:

- **Paths:** names are normalised. `..`, absolute paths, `.git/` and symlinks are rejected, by the same path guard as the editor. `node_modules`, build output and OS junk (`.DS_Store`, `Thumbs.db`) are skipped and listed.
- **Type by content, not by extension:** image types are confirmed from their first bytes. SVGs are never shown inline, because they can carry scripts; they are offered as downloads.
- **Secrets:** uploaded files are scanned with the same patterns as gitleaks before they reach a worktree. A file that looks like a key or `.env` is held back for the owner to confirm or drop.
- **Archives:** a `.zip` is never unpacked on the web server. It is extracted inside the sandbox, with size and file-count limits.
- **Access:** storage is owner-only (RLS), and images are served through short-lived signed URLs.

**Pictures for the agent:** images attached in the agent panel go through the model gateway to providers that can read images (a `vision` capability on each adapter, Sprint 5). The budget guard counts them like any other input.

### 2. Terminal (Sprint 6, with the sandbox)

- A **Terminal** tab in the bottom panel, beside Console: a real interactive shell (xterm.js) for the project.
- It runs **inside the project's sandbox container** on the worker, never on the web server or the owner's machine. It is non-root, has CPU, memory, disk and time limits, and network egress is limited to the allowlist (package registry, GitHub).
- The browser connects over a WebSocket through an authenticated gateway. The connection uses a short-lived ticket tied to the owner's session; there are no long-lived credentials in the browser.
- **Owner only, MFA on start.** It times out after 15 minutes idle (configurable), and you can open several terminals.
- Each session is audited: start and stop, and the commands typed (with secrets redacted). Output is not stored.
- It works in the **same worktree** the agent uses for that task, so files you change by hand show in the diff, and the agent sees them.

### 3. Agent panel (Sprint 6) and how it shares the terminal

- The **agent panel** is the right-hand panel, as in VS Code. You pick the agent and model, describe the work, attach files or pictures, and watch it plan, edit and run commands.
- When the agent runs a command, it runs in the **same sandbox**, and the command and its output appear live in an **Agent** tab of the terminal panel. You see exactly what it ran.
- **Approval:** commands on the safe list (install, build, test, lint, read-only git) run straight away. Anything else (deleting files, network calls outside the allowlist, `git push`) waits for your approval in the panel. The policy engine (threat model T12) checks every command, and you can tighten or loosen the list in Settings.
- You can stop an agent run at any time. Its partial changes stay in the worktree for review.

### 4. Settings

Per project (Project → Settings → Workspace), with safe defaults:

- Upload limits, allowed attachment types, and folders to skip.
- Sandbox: Node version, install command, start, test and build commands, non-secret environment variables. Secrets are picked from the secret store; they are never typed in plain text.
- Terminal: idle timeout and the maximum number of open sessions.
- Agent: default model per agent, command approval mode (ask every time / safe list / custom list), iteration and budget caps.

Global (Settings): model provider keys and budgets (Sprint 5), and the GitHub App (Sprint 3).

## Consequences

- The cockpit gets the VS Code layout: explorer on the left, editor in the middle, agent panel on the right, and terminal and console at the bottom. The resizable panels from Sprint 1 already provide the frame.
- Uploads arrive in Sprint 4, when the editor and diff do. The terminal and the agent's commands need the sandbox, so they arrive together in Sprint 6. Until then, the bottom panel keeps its Console.
- Running real shells in the browser adds trust boundaries. The threat model gains T31 (malicious upload), T32 (terminal abuse or escape) and T33 (an agent running a harmful command). Each has controls and tests in the sprint that delivers it.
- Sandbox time is a real cost on Railway. Idle timeouts and per-project limits keep it in check, and it shows in the usage ledger.
