# Model providers and the spend cap

Sprint 5. Keys never go in the browser or in git.

## Turn a provider on

1. Open an account and put a small test balance on it. Record the date, model IDs and prices in `docs/provider-register/providers.md` before adding funds.
2. Set the key in the server environment only (Vercel → Environment Variables, marked Sensitive, and the worker on Railway): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` or `CEREBRAS_API_KEY`. Settings → Models → **Providers** shows which are free, a trial or paid, and which keys are set. Each provider whose key is set appears in the Assistant's **AI model** list, with free models marked "(free)". Gemini and DeepSeek have a template adapter but no dated prices yet, so the gateway refuses them until a price is added to `packages/model-gateway/src/prices.ts`.
   - **OpenRouter** (openrouter.ai → Keys): one key for hundreds of models. Nexus lists three free models (Nemotron 3 Ultra, Cohere North Mini Code, Gemma 4 31B) and four cheap open coders (Qwen3 Coder, DeepSeek V4.1 Flash, GLM 5.3, gpt-oss-120b), priced from OpenRouter's model list on 2026-11-03. Free models allow about 50 requests a day (1,000 after a $10 top-up) and may log prompts: block OpenRouter, or pick paid models, for client work.
   - **Cerebras** (cloud.cerebras.ai → API Keys): very fast gpt-oss-120b and Qwen 3.8 27B. There is no renewing free tier: adding a card gives a one-time $5 credit for 30 days, then it is paid per token.
3. Leave `NEXUS_MODEL_FIXTURE` unset (or `0`) on anything that is not your own machine. It is ignored unless Supabase is on localhost. Local development and Playwright set it to `1` so the assistant can be tried without spending.

## Caps

- Global monthly cap: Settings → Models. Changing it, or lifting the stop, needs the second factor.
- Project cap and per-run cap: Project → Settings → Models.
- Fallback (ADR 0018): on by default. When a provider is down, rate-limited or **declines** a request under its own usage policy, the next allowed provider answers; the switch is shown on the reply and stored on the ledger row (a declined attempt is billed and marked `ProviderDeclined`). With fallback off, the reply names the providers to try instead, and the owner picks one under **AI model**. Narrow the allowed providers, or turn fallback off, for a project whose client data must stay with one provider.
- Warnings at 50%, 75% and 90%. At 100% the call is refused before the provider is contacted. "Lift the stop" allows calls for 24 hours without raising the number.

## Smoke

`.github/workflows/model-smoke.yml` runs one short prompt per configured key, under `NEXUS_SMOKE_MAX_USD` (default $0.02). With no keys it skips. That is not the benchmark.
