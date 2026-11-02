# ADR 0003: Next.js, TypeScript and Tailwind for the web app

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

The cockpit needs an IDE-like dark UI, a client portal and server-side API routes.

## Decision

Next.js (App Router) + React + TypeScript + Tailwind CSS. Monaco Editor arrives in Sprint 4. Accessible primitives (Radix) are used for interactive components.

## Consequences

Large ecosystem and first-class Vercel deploys. Server components keep secrets on the server by default.
