# ADR 0005: Browser-only workspace with managed sandbox execution

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: browser-only versus a local desktop/CLI agent, and managed versus self-hosted compute.

## Decision

Release 1 is browser-only. Agent builds, tests and file operations run on a managed worker (Railway) inside ephemeral non-root containers with CPU, memory, time, disk and process limits and a default-deny network egress allowlist. A local agent may be reconsidered after Release 1.

## Consequences

Smaller attack surface and a single execution model to secure. Work on local folders requires pushing to GitHub first. Execution costs are visible on the Railway bill.
