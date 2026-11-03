# ADR 0018: The owner's creative freedom

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decider:** Henry Ugochukwu (owner)

## Context

Nexus Cloud exists so its owner can build whatever he imagines (software, apps, websites, videos, images, writing), using many AI providers, so that no single tool, vendor or plan limits him. The owner asked for this to be a written rule that every sprint follows.

## Decision

### 1. Nexus Cloud never restricts what the owner creates

- **No content or category limits of its own.** Nexus Cloud has no list of forbidden kinds of software, apps, topics, styles or media for the owner. Any language, framework, platform, industry, or kind of app, game, tool, video or image is in scope. No feature is designed to judge or narrow the owner's ideas.
- **No lock-in to one provider.** The model gateway connects many providers (xAI, Anthropic, OpenAI, Gemini, DeepSeek, Groq and more over time). If one provider declines a request, is down, is slow, or is too expensive, the owner can send the same work to another one with one click. The router can also do this automatically, following the owner's fallback rules. Adding a new provider is one adapter, not a redesign.
- **Every limit is the owner's own setting.** Budgets (ADR 0007), upload and file limits (Workspace settings), iteration caps, approval modes and sandbox resources all exist to protect the owner's money and work, not to restrict him. Each one shows its current value and can be raised or changed by the owner in Settings. When a limit stops something, the message says which setting it was and how to change it.
- **The owner decides, always.** Approval steps (MFA on risk actions, approving deploys or agent commands) ask the owner. They never refuse him. He can change how often he's asked, per project.
- **Nexus AI Hub's public rules are separate.** Moderation and age checks in the Hub apply to **public customers** (ADR 0015, threat model T28), never to the owner's own work in Nexus Cloud.

### 2. What no software can switch off

Two kinds of limit sit outside Nexus Cloud. Saying them plainly here is part of being honest with the owner, not a restriction added by Nexus:

1. **Each AI provider's own usage policy.** Every provider decides what its models will produce, under the terms the owner accepted when opening the account (ADR 0008). Nexus can't change or get round those rules, and trying (for example, disguising prompts to defeat a provider's safety system) would break the terms and risk the owner's accounts and API keys. What Nexus does instead is section 1: route the work to another provider whose terms allow it, and show which provider produced what.
2. **The law.** For example, no content that sexualises minors, no impersonating real people to deceive, no malware aimed at systems the owner doesn't own, and copyright and privacy rules where the work is published. This is the owner's own legal protection.

### 3. Protections that guard the owner (adjustable, not restrictions)

These keep the owner's accounts, money and code safe. They never limit what he can build. They can be tuned; they are only never silently removed:

- Secrets stay server-side and redacted from logs (T03, T21). Uploaded secrets are held back for the owner's decision (T31).
- Untrusted code runs in the sandbox, not on the owner's servers or accounts (ADR 0005).
- `main` and production change only through the owner's approval (T09, T16).
- Every action is in the audit log, so the owner can always see what happened and undo it.

## Consequences

- Sprint 5 (model gateway): multi-provider routing with one-click "try another provider", fallback chains the owner configures, and plain messages when a provider declines. A provider's refusal is reported as that provider's decision, with the alternatives offered. It is never presented as Nexus forbidding the work.
- Sprints 6 and 10 (agents): the agents' tool policy blocks only actions that would harm the owner's own assets (leaking secrets, writing outside the worktree, unapproved pushes to `main`), never the subject of the work.
- Sprint 11 (marketing studio): image and video generation offers every connected media provider, with the same routing.
- Any future feature that would limit the owner must be an owner-adjustable setting with a visible reason, or it needs a new ADR that the owner approves.
