# ADR 0004: Supabase for database, auth, storage and RLS

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

We need Postgres, identities, file storage and row-level access boundaries without running them ourselves.

## Decision

Use Supabase: Postgres with migrations in `supabase/migrations`, Auth, Storage and Row Level Security on every table (deny by default). Two hosted projects: nexus-dev and nexus-staging; local development uses the Supabase CLI in Docker. The service-role key is used only by server and worker code.

## Consequences

RLS policies need their own pgTAP tests (Sprint 1 onward). Schema changes are reviewed before reaching staging or production.
