# Provider Register

Dated record of every external provider. **Rule:** before enabling an adapter or adding funds, check the official docs and fill in every column with the date checked. Community comments are leads, not proof.

- **Global API cap:** USD 20/month, hard stop at 100%, warnings at 50/75/90% (ADR 0007)
- **Last full review:** not yet (first review is due at the start of Sprint 5)

## Model providers (benchmark candidates, ADR 0008)

| Provider                       | Docs / pricing                                           | Account | Test balance | Model IDs (verified) | Input / output price | Data retention / training | Rate limits | Region | Date checked |
| ------------------------------ | -------------------------------------------------------- | ------- | ------------ | -------------------- | -------------------- | ------------------------- | ----------- | ------ | ------------ |
| xAI Grok                       | https://docs.x.ai/developers/pricing                     | ☐       | ☐            |                      |                      |                           |             |        |              |
| Anthropic Claude               | https://platform.claude.com/docs/en/about-claude/pricing | ☐       | ☐            |                      |                      |                           |             |        |              |
| OpenAI                         | https://developers.openai.com/api/docs/pricing           | ☐       | ☐            |                      |                      |                           |             |        |              |
| Google Gemini                  | https://ai.google.dev/gemini-api/docs/pricing            | ☐       | ☐            |                      |                      |                           |             |        |              |
| DeepSeek                       | https://api-docs.deepseek.com/quick_start/pricing/       | ☐       | ☐            |                      |                      |                           |             |        |              |
| OpenRouter (optional fallback) | https://openrouter.ai/docs                               | ☐       | ☐            |                      |                      |                           |             |        |              |

## Platform providers

| Provider | Use                           | Docs                             | Plan / cost | Tokens needed (scopes)                                     | Date checked |
| -------- | ----------------------------- | -------------------------------- | ----------- | ---------------------------------------------------------- | ------------ |
| GitHub   | Source control, App, webhooks | https://docs.github.com/en/rest  |             | App: contents r/w, pull_requests r/w, checks r, metadata r |              |
| Vercel   | Web hosting, previews         | https://vercel.com/docs/rest-api |             | Preview token; separate production token                   |              |
| Railway  | Worker + sandbox hosting      | https://docs.railway.com         |             | Project-scoped token                                       |              |
| Supabase | Postgres, Auth, Storage       | https://supabase.com/docs        |             | Anon key (browser); service role (server only)             |              |
| Sentry   | Error monitoring              | https://docs.sentry.io           |             | DSN                                                        |              |
| Resend   | Email notifications           | https://resend.com/docs          |             | Sending key                                                |              |

## Media providers (Sprint 11 — evaluate later)

| Provider | Docs                                          | Date checked |
| -------- | --------------------------------------------- | ------------ |
| Runway   | https://docs.dev.runwayml.com/guides/pricing/ |              |
| fal.ai   | https://fal.ai/pricing                        |              |

## Change log

| Date       | Change                                         |
| ---------- | ---------------------------------------------- |
| 2026-11-02 | Register created; five model candidates listed |
