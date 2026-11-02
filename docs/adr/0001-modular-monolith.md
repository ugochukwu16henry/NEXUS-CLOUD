# ADR 0001: Modular monolith plus a worker process

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

The blueprint warns against premature microservices. One developer must build, run and debug the whole system.

## Decision

Ship one Next.js web app (UI + thin API route handlers) and one Node worker process. Domain logic lives in `packages/*` with enforced import boundaries so modules can be split later if operational evidence demands it.

## Consequences

Simple deploys and local development. Boundary rules must be enforced by lint, or the monolith will tangle. Long-running work never runs on the request path.
