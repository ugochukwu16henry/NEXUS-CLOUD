# ADR 0020: Owner-only platform, one database

- **Status:** Accepted
- **Date:** 2026-11-03
- **Decider:** Henry Ugochukwu (owner)
- **Supersedes:** ADR 0015 (Nexus AI Hub as a public product), ADR 0011 (client visibility and invites), ADR 0018 §1a (rules for third parties)

## Context

ADR 0015 brought Zentrix AI Hub into this repository as **Nexus AI Hub**, a public pay-as-you-go product with its own database, Naira wallet, Paystack payments and an Owner Dashboard for customers and revenue. ADR 0011 planned client portals, and ADR 0018 §1a planned content rules for third parties.

On 2026-11-03 the owner decided that Nexus Cloud is for him alone, as a software engineer building apps. There will be no customers, no clients, no other users and no payments.

## Decision

1. **One user: the owner.** The app grants access only to the owner's membership. Any other signed-in account sees "No access". Sign-up stays closed to every email except the owner's (ADR 0013). The permission list keeps the second-factor rule for risk actions (approvals, the terminal, GitHub, budgets).
2. **One database: Nexus Cloud's Supabase project.** The Hub API (`apps/hub-api`) is removed, together with its own database migrations, the Paystack and wallet code, its CI job, its database-deploy workflow and its runbook. `packages/money` (Naira, VAT, margins) went with it. Separate Hub Supabase projects, if any were created, should be deleted by the owner.
3. **No payments, no business dashboard.** The Owner Dashboard (customers, top-ups, revenue, provider balances) is removed. What the owner spends on AI is already on Settings → Models (usage ledger, budgets, monthly cap).
4. **No client features.** The "Client" field on projects, "Show to the client" on milestones, and the planned "Client rooms" and "Marketing" sections are removed. The workflow column "Client Review" is now "Final Review": the owner's last check before release.
5. **Creation from the Hub plan stays, for the owner.** Video and image generation (xAI and others) will be built as an owner-only **Studio** inside Nexus Cloud, on this database and the model gateway's budgets, with no wallet.
6. **ADR 0018 still holds for the owner:** Nexus adds no limits on what he creates, every limit is his own setting, and providers' policies and the law sit outside the platform.

## Consequences

- Fewer moving parts: one app, one worker, one database, one set of keys.
- The database's role type and a few columns keep their old values (`client`, `viewer`, `client_name`, `client_visible`, artifact visibility `client`): removing enum values and columns from a live database is risky and gains nothing. The app no longer reads or writes them, and the browser still cannot create memberships.
- The pgTAP isolation tests that use a second, non-owner user still pass; that user now stands for "anyone who isn't the owner".
- The Hub code stays in Git history if it is ever wanted again; bringing back any multi-user or paid feature needs a new ADR.
