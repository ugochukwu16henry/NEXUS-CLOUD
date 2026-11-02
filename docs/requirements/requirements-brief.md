# Requirements Brief — Release 1

- **Version:** 1.0 (Sprint 0) · **Date:** 2026-11-02 · **Owner:** Henry Ugochukwu
- **Sources:** Concept Development Blueprint v1.0; `docs/plan/Nexus_Cloud_Structure_Sprint_and_Test_Plan.pdf`; ADRs 0001–0012

## 1. Problem and goal

Henry runs every role on his software projects: owner, architect, developer, tester, project manager and client lead. The work is spread across GitHub, Vercel, Railway, Supabase, several AI chat tools and ad-hoc client updates. Nexus Cloud brings it into one dark cockpit that coordinates AI specialist agents, keeps the repository as the source of truth, gates risky actions behind human approval, makes cost visible and shows clients only approved progress.

**Release 1 proof:** one complete, traceable task goes from request to preview. A connected repo gets a feature request, a planned and approved scope, an agent-made branch and diff, tests and a security scan, a review, a preview deployment and a read-only progress page, with cost and evidence shown at each stage.

## 2. Personas

| Persona                  | Description                     | Needs                                                                                     |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| **Owner** (Henry)        | Sole operator with full control | Plan, delegate to agents, review diffs, approve risk actions, see cost, report to clients |
| **Client**               | Invited per project             | See approved milestones, previews and summaries; give feedback; sign off                  |
| **Viewer**               | Sponsor or board member         | Read-only progress report                                                                 |
| **Agent** (system actor) | Specialist AI worker            | Bounded task, context, tools, budget and stop condition; no direct cloud credentials      |

## 3. In scope (Release 1)

1. Project cockpit: projects, requirements, tasks, milestones, workflow board, activity timeline, budgets.
2. Repository workspace: GitHub App, file tree, editor, diffs, branches/worktrees, safe commit and revert.
3. Model gateway: five provider adapters (xAI, Anthropic, OpenAI, Gemini, DeepSeek), routing, usage ledger, budget guard.
4. Agents: intake, research, planner, architect, UX, coding, code reviewer, test engineer, security reviewer, release, documentation, marketing, client reporter.
5. Quality gates: build, lint, typecheck, unit, E2E, accessibility and security scans with blocking gates.
6. Preview deployments (Vercel, Railway), a release gate, rollback notes and evidence bundles.
7. Invite-only client portal with approved content, feedback and sign-off.
8. Marketing studio for drafts and costed media generation behind an approval queue.

## 4. Out of scope (Release 1)

- Building a cloud provider, or replacing GitHub, Vercel, Railway or Supabase.
- Unrestricted autonomous production changes; scanning third-party systems.
- Public sign-up, marketplace, subscriptions, multi-tenant hosting (Phase 9).
- Languages other than TypeScript/JavaScript (ADR 0009).
- A local desktop/CLI agent (ADR 0005).
- Automatic social publishing (export only until platform permissions are reviewed).

## 5. Non-functional requirements

| ID                   | Requirement                                                                                                                   | Measure                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| NFR-01 Security      | Model API keys and service-role keys never reach the browser, logs or prompts                                                 | CI bundle scan + log-scan tests pass      |
| NFR-02 Access        | RLS on every table, deny by default                                                                                           | pgTAP suite: 100% of tables covered       |
| NFR-03 Approval      | Production deploy, destructive migration, secret change, permission escalation and bulk publication need owner approval + MFA | Release-gate tests                        |
| NFR-04 Audit         | Every state-changing action writes one audit event                                                                            | Route-sweep integration test              |
| NFR-05 Cost          | Global hard stop USD 20/month; warnings at 50/75/90%                                                                          | Budget-guard boundary tests               |
| NFR-06 Performance   | API p95 < 300 ms (reads), < 800 ms (writes); LCP < 2.5 s                                                                      | k6 + Lighthouse on staging                |
| NFR-07 Accessibility | WCAG 2.2 AA                                                                                                                   | axe zero serious/critical + manual checks |
| NFR-08 Recovery      | RPO ≤ 24 h, RTO ≤ 2 h, rollback ≤ 10 min                                                                                      | Drills in Sprints 8 and 12                |
| NFR-09 Sandbox       | Agent code runs non-root with resource limits and default-deny egress                                                         | Sandbox escape and limit tests            |
| NFR-10 Transparency  | Every client-facing progress claim links to an artifact                                                                       | Client-reporter evaluation                |

## 6. Milestone acceptance criteria

Each criterion is written to be testable. The traceability matrix (from Sprint 2) links each one to test IDs.

**M0 Foundation (Sprint 0)**

- Given a PR with a failing unit test, when CI runs, then the PR check fails.
- Given a PR that contains a fake secret, when the security workflow runs, then gitleaks fails the check.
- All Phase 0 decisions are recorded as accepted ADRs.

**M1 Cockpit reliable (Sprints 1–2)**

- Given an unauthenticated visitor, when they request any cockpit route, then they are redirected to sign-in.
- Given a task in Backlog, when anyone tries to move it straight to Deployed, then the transition is rejected.
- Given a user outside a project, when they query its rows directly through the API, then zero rows are returned.

**M2 Traceable, reversible change (Sprints 3–4)**

- Given a connected repo, when the owner edits a file and commits, then the commit lands on a task branch (never main) and appears in the timeline.
- Given a commit on a task branch, when the owner reverts it, then the branch diff against its base is empty.
- Given a forged webhook, when it arrives, then it is rejected and logged.

**M3 Agent produces reviewable code (Sprints 5–6)**

- Given an approved plan, when the coding agent runs, then it produces a diff, a changed-file summary and a recorded cost, all within its budget.
- Given a project at 100% of its budget, when an agent run is requested, then no paid call is made until the owner extends the budget.
- Given a repository README with hostile instructions, when an agent reads it, then policy blocks every out-of-policy action.

**M4 Failed checks block release (Sprint 7)**

- Given a diff with a failing test or a high-severity finding, when the gates run, then the task moves to Blocked with the evidence attached.

**M5 First demo (Sprint 8)**

- The full Release 1 proof (section 1) runs end to end on the pilot repo.
- Given a preview-deploy token, when it is used against production, then the deploy fails.

**M6 Client reviews securely (Sprint 9)**

- Given client A, when they request any of client B's resources, then access is denied.
- Given an invite older than 7 days, or one already used, when it is opened, then it is rejected.

**M7 Assets costed and approved (Sprint 11)**

- Given an image or video request, when it is submitted, then a cost estimate is shown and approval is required before generation.

**M8 Release 1.0 (Sprint 13)**

- One week of real use with no open P1/P2 defects; the UAT checklist is signed.

## 7. Assumptions and open questions

- Accounts for GitHub, Vercel, Railway and Supabase exist or will be created by the owner. API accounts for the five model providers are funded with small test balances only (ADR 0007).
- Exact model IDs and prices are verified and dated in `docs/provider-register/` before each adapter is enabled.
- **Open:** domain name and trademark check for "Nexus Cloud" (working name only).
- **Open:** whether Monaco or CodeMirror is preferred after the Sprint 4 spike (default: Monaco).
