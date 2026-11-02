# ADR 0009: TypeScript and JavaScript only in the MVP

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: language support for Release 1.

## Decision

Release 1 supports TypeScript/JavaScript web projects (npm/pnpm/yarn, Vitest/Jest, Playwright). Interfaces for test runners and scanners are written so other stacks (Python, Java, C#) can be added later.

## Consequences

Narrow scope keeps the first release achievable, as the blueprint advises.
