# ADR 0012: Personal workflow before SaaS

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: Henry's immediate workflow versus long-term SaaS ambitions.

## Decision

Release 1 serves one owner (Henry) plus invited clients. Organizations, self-service sign-up, billing and multi-tenant hosting (Phase 9) are gated behind a security, legal and load review after Release 1.

## Consequences

The data model keeps a workspace_id on records so tenancy can be added later without a rewrite.
