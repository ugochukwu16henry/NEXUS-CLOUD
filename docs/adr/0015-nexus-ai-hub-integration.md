# ADR 0015: Bring Nexus AI Hub (formerly Zentrix AI Hub) into the platform

- **Status:** Superseded by [ADR 0020](0020-owner-only-platform.md) (owner-only platform, one database), 2026-11-03
- **Date:** 2026-11-03
- **Decider:** Henry Ugochukwu (owner)
- **Sources:** _Zentrix AI Hub – Development Concept and Production Plan_ v1.0 (13 Oct 2026), _Zentrix AI Hub – Product Design_ ("Ink & Cobalt"), repository `ugochukwu16henry/Zentrix-AI-Hub` (Phase 0: commit `0a5a0d6`, plus `0d349d4` on branch `claude/gracious-brahmagupta-zsp0xu`, not yet merged)

## Context

Two products, one owner, one company:

|              | **Nexus Cloud** (this repo)                                                     | **Nexus AI Hub**                                                                |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Who uses it  | Henry, plus invited clients (ADR 0012)                                          | The public: creators, developers, students, 18+, in Nigeria first               |
| What it does | AI agents that write, test and deploy code in Henry's repos                     | Pay-as-you-go AI video, images, coding help and study help, in Naira            |
| Money        | A USD 20/month hard stop on Henry's own model spend (ADR 0007)                  | A prepaid Naira wallet, an append-only ledger, Paystack and Flutterwave top-ups |
| Admin view   | The cockpit is the admin view                                                   | The Owner Dashboard: users, revenue, provider bills, pricing, safety            |
| Stack today  | Next.js 16 server actions, Supabase (Auth, RLS), pg-boss, pnpm 11, TS 6, Vitest | NestJS 11 API, plain `pg`, Redis + BullMQ (planned), pnpm 10, TS 5.9, Jest      |
| Built so far | Sprints 0–2: auth, MFA, RLS, audit, project cockpit, deployed                   | Phase 0: schema, wallet and ledger, pricing, Paystack webhook, tested           |
| Providers    | xAI, Anthropic, OpenAI, Gemini, DeepSeek                                        | xAI (Grok Imagine, Grok text), Groq (gpt-oss, Whisper), Gemini as backup        |
| Look         | Dark navy cockpit, teal and blue                                                | "Ink & Cobalt": light first, one cobalt accent, no gradients, Geist fonts       |

They overlap in exactly the places that matter: both need an **AI gateway** across several providers, both meter **cost per request**, both need an **admin view with MFA**, and both use Sentry, Railway, Vercel and Supabase. They differ in the place that matters most for security: **who can sign in**.

Nexus agents hold write access to repositories and deploy tokens. A public sign-up page in the same identity system as those agents would be the largest risk the platform could take on.

## Proposed decision

### 1. One repository, two trust zones

The Hub (renamed **Nexus AI Hub** on 2026-11-03) moves into this monorepo, keeping its Git history (`git subtree`), after its open security branch is merged. Each part of the platform lives in exactly one zone:

```
                      ┌──────────────────── STAFF ZONE (invite-only, MFA) ────────────────────┐
                      │  apps/web  "Nexus Cloud"                                                │
  Henry and staff ───►│    /owner/*    Owner Dashboard (business)  ◄──── nav ────►  /*  Nexus   │
                      │                Users, revenue, provider bills,             agent cockpit│
                      │                pricing, payments, safety, growth           (as today)   │
                      │  apps/worker   agent jobs (GitHub, Vercel, Railway tokens live here)    │
                      │  Supabase project: nexus (existing)                                     │
                      └───────────────┬────────────────────────────────────────────────────────┘
                                      │ server-side only: read-only DB role + signed admin calls
                      ┌───────────────▼──────────── CUSTOMER ZONE (public, 18+) ───────────────┐
  Creators, devs,  ──►│  apps/hub-web   Nexus AI Hub: Studio  , Console, Academy, Wallet        │
  students            │  apps/hub-api   NestJS: wallet, ledger, Paystack/Flutterwave, jobs      │
                      │                 (later: public API and mobile apps, which need real HTTP)│
                      │  apps/hub-worker  video and text jobs (provider keys for the Hub only)  │
                      │  Supabase project: nexus-ai-hub (new)                                    │
                      └────────────────────────────────────────────────────────────────────────┘

  Shared packages: model-gateway · money · ui (tokens, two themes) · observability · config · audit
```

- **Separate databases.** Customer accounts, wallets and the ledger live in their own Supabase project. A customer can never obtain a session in the staff zone. Consumer data falls under the NDPA, and it grows on its own schedule.
- **The Owner Dashboard lives in the staff app.** Henry signs in once, with the MFA that already exists, and moves between **Business** (Owner Dashboard) and **Engineering** (agent cockpit) from the same navigation. The dashboard reads Hub data on the server through a read-only database role. Actions such as a refund, a suspension or a price change go through `hub-api` with a signed admin call, and are written to both audit logs.
- **Separate provider keys and budgets.** The Hub's xAI and Groq spend is paid from customer top-ups and governed by the wallet. The Nexus USD 20 cap stays on Henry's engineering keys. A traffic spike in the Hub can never stop the agents, and the reverse holds too.

### 2. "Developer agent": how the two dashboards link

The Hub design has a **Developer Console** for the public: coding chat, an error explainer and an app builder. That differs from the **Nexus agent dashboard**, where agents commit to real repositories. They link as follows:

- **Staff developers (from the harmonization sprint):** the Owner Dashboard and the Hub's Developer Console show a **"Developer agent"** entry to Zentrix staff. It opens the Nexus agent dashboard exactly as it is today, behind the staff sign-in.
- **Public developers (later phase, proposed):** paying developers get agents of their own. This makes Nexus multi-tenant, which ADR 0012 gates behind a security, legal and load review. It needs per-user sandboxes, per-user GitHub App installations, and agent runs paid from the Hub wallet (Nexus's budget guard becomes a wallet hold, capture and release). Until then, the button shows public developers the Hub's own Developer Console.

### 3. One engine where the two overlap

- **AI gateway:** one `packages/model-gateway`, built once in Nexus Sprint 5. It has adapters for xAI, Groq, Anthropic, OpenAI, Gemini and DeepSeek, with timeouts, retries, moderation and usage logging. Both zones use it, each with its own keys.
- **Money:** the Hub's `money.ts` (whole kobo, versioned prices and FX) becomes `packages/money`. The Nexus budget ledger records provider cost in the same units, so the Owner Dashboard can show **one provider bill**: xAI is used by the Hub and by the agents.
- **Queue:** one technology, pg-boss, which Nexus already chose (ADR 0005). It runs in the Postgres we already pay for, so no Redis is needed. The Hub and the agents run separate worker processes, because the agent worker holds repository tokens.

### 4. Toolchain on one standard

Everything moves to what Nexus already enforces: pnpm 11 with the 7-day release-age rule, TypeScript 6, Vitest, ESLint and Prettier, and the same CI gates (gitleaks, OSV-Scanner, Semgrep, bundle secret check). The Hub's SQL migrations move to a second Supabase directory (`apps/hub-api/supabase/`, deployed with `--workdir apps/hub-api`). They keep the Hub's own security test, under which every table has RLS and the Data API is locked.

### 5. One brand family

**Nexus** is the product family of Zentrix Software Solutions: **Nexus Cloud** (staff: agents and the Owner Dashboard) and **Nexus AI Hub** (the public product). The shared `@nexus/ui` token package gains two themes:

- **Ink & Cobalt** for the Hub, the public product (light first, Geist, money in Geist Mono).
- **Console dark** for the staff app, which is the current Nexus look, aligned to Geist and the same type scale.

The Nexus logo becomes the engineering sub-brand mark. Whether it keeps its teal gradient, against Ink & Cobalt's "no gradients" rule, is the owner's call (see the open questions below).

## Harmonization sprint (1 week, before Sprint 3)

| #   | Work                                                                                                                          | Done when                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Merge the Hub's security branch; import the Hub with its history into `apps/hub-api` (migrations in `apps/hub-api/supabase/`) | Hub tests (wallet, ledger, Paystack webhook, RLS lock) pass in this repo's CI |
| 2   | Align the toolchain: pnpm 11, TS 6, Vitest, lint and format                                                                   | `pnpm lint`, `typecheck`, `test` are green across all apps                    |
| 3   | Extract `packages/money`; stub `packages/model-gateway` with the interface both zones will use                                | Unit tests; the Hub API uses the shared package                               |
| 4   | Staff app navigation: **Business** and **Engineering** areas; Owner Dashboard shell with "Today at a glance" from sample data | E2E: sign in once, move between both areas, axe clean                         |
| 5   | Two themes in `@nexus/ui`; Geist fonts                                                                                        | Both themes pass WCAG AA contrast checks                                      |
| 6   | Create the `nexus-ai-hub` Supabase project and its deploy job (same composite action as Nexus)                                | Hub migrations auto-deploy to staging, then production                        |
| 7   | Threat model: add the customer zone (public sign-up, payments webhooks, wallet fraud, content moderation)                     | New threats have controls and an owning sprint                                |
| 8   | Update the master plan PDF with the combined roadmap                                                                          | Regenerated PDF committed                                                     |

After it, Nexus Sprint 3 (GitHub App) continues unchanged. Hub Sprint 1 (customer accounts and wallet) can then run in parallel, because the two zones share no auth code.

## Consequences

- One repository, one CI standard, one brand, one gateway: Henry runs both Nexus products from one sign-in.
- The agent cloud keeps its single-owner security model. The public product can grow without putting repository tokens at risk.
- Two Supabase projects cost more than one: about USD 25/month more once the Hub leaves the free tier.
- The NestJS API remains, unlike the rest of the platform (ADR 0014). It is justified because the Hub needs public webhooks now, and a public API and mobile apps later.
- ADR 0012 still holds. Opening Nexus agents to public developers is a separate, later decision.

## Owner decisions (2026-11-03)

1. **Agents:** staff now, public later. Zentrix staff open the Nexus agent dashboard from "Developer agent". Public developers get the Hub's Developer Console until a later phase opens agents to them, after the review ADR 0012 requires.
2. **Brand:** two themes, one family. Ink & Cobalt for the Hub; the dark Console look and the Nexus mark stay as the engineering sub-brand. Both use Geist.
3. **Database:** separate Supabase projects for the staff zone (`nexus`) and the customer zone (`nexus-ai-hub`).
4. **Name:** the public product is **Nexus AI Hub**. Zentrix Software Solutions is the company behind both Nexus products.
