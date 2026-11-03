# Open and free AI APIs for Nexus (research, 2026-11-03)

Sources are vendor pages, aggregators and community lists that often disagree; every limit below must be re-checked in the provider's own console before relying on it. "Free" means a standing free tier, not trial credits. Nexus adds a provider as one OpenAI-compatible adapter plus a dated price list (ADR 0008, ADR 0018).

## Already in Nexus

| Provider           | Free tier                                                        | Open models                   | Status                              |
| ------------------ | ---------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| Anthropic (Claude) | No                                                               | No                            | Live adapter                        |
| OpenAI             | No standing free tier                                            | gpt-oss (Apache 2.0)          | Live adapter; also voice fallback   |
| xAI (Grok)         | No                                                               | No                            | Live adapter                        |
| Groq               | **Yes** (per-model RPM/TPM/day caps; Whisper 2,000 requests/day) | Llama, Qwen, gpt-oss, Whisper | Live adapter; **default for voice** |

## Recommended to add next

| Provider      | Free tier                                                                           | What it gives                                                                         | Notes                                                                              |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| OpenRouter    | **Yes**: `:free` models, about 20 req/min and 50/day (1,000/day after a $10 top-up) | One key for hundreds of models, many open (Qwen3-Coder, DeepSeek, GLM, Kimi, gpt-oss) | Best variety; free models can change                                               |
| Google Gemini | **Yes** (per-project quotas in AI Studio)                                           | Gemini Flash family                                                                   | Free-tier prompts may be used to improve Google products; keep client work on paid |
| Cerebras      | **Yes**, about 1M tokens/day                                                        | Very fast Llama/Qwen/gpt-oss                                                          | Model list changes without notice                                                  |
| Mistral       | **Yes** (opt-in to training, phone verification)                                    | Mistral, Codestral, Devstral (Apache 2.0 small models)                                | Free tier trains on your data; not for client code                                 |
| DeepSeek      | No (very low prices)                                                                | DeepSeek V4 (MIT)                                                                     | Cheap strong coder via its own API                                                 |

## Worth knowing

- **Cloudflare Workers AI**: a daily free allowance on edge-hosted open models.
- **Hugging Face Inference Providers**: a small monthly free credit over one OpenAI-compatible endpoint.
- **NVIDIA NIM**: OpenAI-compatible access to many open-weight models (free developer access reported; confirm).
- **Together, Fireworks, DeepInfra**: paid hosting of open models, no reliable free tier.

## Open-weight models for developers (self-host or via the hosts above)

| Model                    | Licence      | Fits                                      |
| ------------------------ | ------------ | ----------------------------------------- |
| Qwen3-Coder              | Apache 2.0   | Local or single big machine; strong coder |
| DeepSeek V4 / V4.1 Flash | MIT          | Hosted; cost-efficient reasoning and code |
| GLM-5.x                  | MIT          | Long-running engineering agents           |
| Kimi K2.x / K3           | Modified MIT | Agentic and multimodal                    |
| Devstral Small 2         | Apache 2.0   | Laptop-size coding agent                  |
| gpt-oss-20b / 120b       | Apache 2.0   | 20b runs in 16 GB; 120b in 80 GB          |
| Whisper large-v3 / turbo | MIT          | Speech to text (hosted cheaply on Groq)   |

Sources disagree on the newest version numbers (GLM 5.2 vs 5.3, Kimi K2.6 vs K3); check the model card before picking one.

## Voice (speech to text)

| Option                                            | Price                      | Free                           |
| ------------------------------------------------- | -------------------------- | ------------------------------ |
| Browser speech recognition (Chrome, Edge, Safari) | Free                       | Yes, no key; used first        |
| Groq whisper-large-v3-turbo                       | About $0.04 per audio hour | Free tier (2,000 requests/day) |
| OpenAI gpt-4o-mini-transcribe                     | About $0.003 per minute    | No                             |

One source reports OpenAI deprecating its transcription models in 2026-27; another lists them as current. Groq is the default either way.
