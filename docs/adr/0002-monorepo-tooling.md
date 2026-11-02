# ADR 0002: pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Web app, worker and shared packages share types and tooling.

## Decision

Use a pnpm workspace with Turborepo task orchestration, TypeScript strict mode everywhere, ESLint (flat config), Prettier, Vitest for unit/integration tests and Playwright for E2E.

## Consequences

One install and one CI pipeline. Turborepo caching keeps CI fast as packages grow.
