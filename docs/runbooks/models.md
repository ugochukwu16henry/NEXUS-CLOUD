# Model providers and the spend cap

Sprint 5. Keys never go in the browser or in git.

## Turn a provider on

1. Open an account and put a small test balance on it. Record the date, model IDs and prices in `docs/provider-register/providers.md` before adding funds.
2. Set the key in the server environment only (Vercel → Environment Variables, marked Sensitive): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY` or `GROQ_API_KEY`. Each provider whose key is set appears in the Assistant's **AI model** list. xAI and Groq use the prices recorded for the Nexus AI Hub plan (2026-10-13). Gemini, DeepSeek and OpenRouter have a template adapter but no dated prices yet, so the gateway refuses them until a price is added to `packages/model-gateway/src/prices.ts`.
3. Leave `NEXUS_MODEL_FIXTURE` unset (or `0`) on anything that is not your own machine. It is ignored unless Supabase is on localhost. Local development and Playwright set it to `1` so the assistant can be tried without spending.

## Caps

- Global monthly cap: Settings → Models. Changing it, or lifting the stop, needs the second factor.
- Project cap and per-run cap: Project → Settings → Models.
- Fallback (ADR 0018): on by default. When a provider is down, rate-limited or **declines** a request under its own usage policy, the next allowed provider answers; the switch is shown on the reply and stored on the ledger row (a declined attempt is billed and marked `ProviderDeclined`). With fallback off, the reply names the providers to try instead, and the owner picks one under **AI model**. Narrow the allowed providers, or turn fallback off, for a project whose client data must stay with one provider.
- Warnings at 50%, 75% and 90%. At 100% the call is refused before the provider is contacted. "Lift the stop" allows calls for 24 hours without raising the number.

## Smoke

`.github/workflows/model-smoke.yml` runs one short prompt per configured key, under `NEXUS_SMOKE_MAX_USD` (default $0.02). With no keys it skips. That is not the benchmark.
