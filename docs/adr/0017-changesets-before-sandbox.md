# ADR 0017: Change sets on GitHub before the sandbox exists

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decider:** Henry Ugochukwu (owner)

## Context

Sprint 4's plan puts a **git worktree per task branch on the worker** behind the editor, uploads, diff and commit. Two facts get in the way:

- The web app runs on Vercel functions: no git binary, no shared disk, and a 4.5 MB request limit.
- The sandbox containers that should hold real worktrees, and run untrusted code, only arrive in Sprint 6 (ADR 0005, ADR 0016).

Building a web-to-worker file protocol now, only to replace it with the sandbox two sprints later, would mean securing two execution paths instead of one.

## Decision

1. **GitHub is the source of truth for code.** The explorer reads the task branch (or the default branch) from GitHub through the installation token (ADR / Sprint 3).
2. **A task's uncommitted work is a change set:** a row per task branch (base commit, status, lock), plus a row per changed file (path, add, modify or delete, size, SHA-256). File contents live in a private storage bucket, never in the browser beyond what the owner opens.
3. **Uploads go straight to storage** through short-lived signed upload URLs, one per file, so the 4.5 MB limit doesn't apply. The server then checks every file (path guard, skip rules, type by content, secret scan, limits) before it joins the change set. Anything flagged waits in **Held back** for the owner.
4. **Commit = GitHub's Git Data API:** blobs, a tree on top of the branch head, a commit, then a fast-forward update of the task branch ref. If the branch moved meanwhile, the update fails and the owner is told, never force-pushed. Commits go only to `task/NX-<n>-…` branches. The default branch and protected branches are refused before any call is made.
5. **Revert** makes a new commit whose tree is the parent's tree, for the latest commit on the task branch. Older commits need a merge, which arrives with the sandbox. **Discard** empties the change set after confirmation.
6. **Lock:** one editor per change set. A lock expires after 10 minutes without a save. A second tab, or later an agent, gets read-only access with a clear message.
7. **Editor: CodeMirror 6 instead of Monaco.** Monaco loads its own web workers and CSS in ways that fight the strict nonce-based CSP. It is also about ten times larger and less accessible to screen readers. CodeMirror 6 bundles cleanly and has syntax highlighting, search and replace, read-only mode and a merge view. **TypeScript diagnostics move to Sprint 7**, where `tsc` runs in the sandbox as a quality gate and its results show in the editor.
8. **Sprint 6** materialises the same change set into a real worktree inside the sandbox, for the terminal and the agent. Nothing in the model changes; the sandbox becomes another reader and writer of it.

## Consequences

- No code runs and no git checkout happens on the web server. That keeps T09 (writes outside the worktree) simple: the only write paths are the change set and GitHub's API, both behind the path guard.
- The Sprint 4 test plan's "real git in a temp dir" integration test becomes an integration test against a local fake GitHub that implements the Git Data endpoints, with real SHA-1 object IDs. Real git returns in Sprint 6 with the sandbox.
- Very large repositories are browsed lazily: one directory at a time, and files over 1 MB open read-only.
- The browser now uploads to Supabase Storage directly, so the CSP's `connect-src` allows the project's Supabase URL as well as `'self'`.
