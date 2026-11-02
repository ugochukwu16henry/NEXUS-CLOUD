# ADR 0011: Client visibility defaults and invite expiry

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: which artifacts clients see by default and whether invites expire.

## Decision

Nothing is client-visible until the owner approves it. Invites are single-use, hashed and expire after 7 days. Client views come from a permission-filtered model that excludes secrets, logs, agent conversations and unreviewed security findings.

## Consequences

The owner must approve artifacts before clients see them. This is extra work, but it is intentional.
