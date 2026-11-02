# ADR 0008: Provider abstraction and benchmark candidates

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: which model wins planning, coding and review. The blueprint says build the abstraction first and enable providers one by one.

## Decision

All model calls go through `packages/model-gateway`. Five providers are benchmark candidates: **xAI Grok, Anthropic Claude, OpenAI, Google Gemini and DeepSeek**. OpenRouter is an optional fallback. The router's default for each task type (planning, routine, complex code, review, research) is chosen from benchmark results recorded in the dated provider register, not opinion. No model API key ever reaches the browser.

## Consequences

Five adapters to build and maintain. Adapters are added one at a time after account access, model IDs, data terms and prices are verified and dated.
