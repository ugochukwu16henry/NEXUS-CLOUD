# Benchmark results — 2026-11-03

**Status:** not run against live models.

No provider account is funded (see `providers.md`: every Account cell is still unchecked). The router defaults in the database are therefore **provisional**. They name the two adapters this sprint ships, Anthropic and OpenAI. They are not evidence that those models won anything.

The scorer from `docs/provider-register/benchmark-plan.md` is implemented in `packages/model-gateway` and covered by unit tests for a valid task graph, a dependency cycle, a refused secret request, and the safety exclusion. Coding tasks stay "not run" until the sandbox exists (Sprint 6). A nightly smoke workflow sends one tiny prompt only when a key is present, and skips otherwise.

Re-run the tasks, then replace this note with the dated scores, before treating a route as a benchmark result.
