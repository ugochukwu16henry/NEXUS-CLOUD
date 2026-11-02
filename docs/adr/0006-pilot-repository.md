# ADR 0006: New sample repository as the pilot project

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: which repository is safe and useful for the first agent tasks.

## Decision

Create a new small Next.js + TypeScript repository (`nexus-pilot-app`) with a few features and real tests, used only for pilot and agent-evaluation work. Existing Zentrix projects are not touched by agents until Release 1 hardening is complete.

## Consequences

Zero risk to real work. The pilot repo must be realistic enough (tests, CI, a few modules) for benchmarks to be meaningful. It is created in Sprint 3 when the GitHub App exists.
