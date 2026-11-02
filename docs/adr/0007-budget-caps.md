# ADR 0007: Initial spend caps and cost controls

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: the initial API budget and hard stop. The blueprint requires per-run, per-project and global caps with warnings.

## Decision

Global API spend cap is **USD 20 per month**, with warnings at 50%, 75% and 90% and a hard stop at 100% until the owner raises it. Each provider is funded with a small test balance only, and nothing is preloaded. Per-run and per-project caps are configured in the model gateway (Sprint 5). Expensive actions (video, large context, multi-agent loops, bulk generation) always ask first.

## Consequences

Benchmarks must be designed to fit the budget (see `docs/provider-register/benchmark-plan.md`). The cap is reviewed at the end of Sprint 5 with real usage data.
