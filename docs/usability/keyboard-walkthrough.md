# Keyboard-only walkthrough (Sprints 0–2)

- **Date:** 2026-11-03 · **Covers:** Sprint 0 "prototype usability" test, re-run on the real Sprint 2 app
- **Automated as:** [`tests/e2e/06-keyboard-walkthrough.spec.ts`](../../tests/e2e/06-keyboard-walkthrough.spec.ts)

The plan's three tasks were done with the keyboard only: every control focused with Tab and activated with Enter or arrow keys. The test also checks that each focused control shows a visible outline.

| Task             | Today's equivalent                                                  | Result                       |
| ---------------- | ------------------------------------------------------------------- | ---------------------------- |
| Open a project   | Projects → Pilot app                                                | Pass                         |
| Review a diff    | Cockpit → Diff tab (sample diff; real repository diffs in Sprint 4) | Pass                         |
| Approve a deploy | Approve a task on the board (deploy approval arrives in Sprint 8)   | Pass, with the MFA challenge |

The skip link is the first Tab stop on every cockpit page and becomes visible when focused. Focus rings show on links, tabs, selects and buttons. Axe reports no serious or critical issues on any page.

## Friction found

| #   | Finding                                                                                                             | Severity | Status                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| 1   | After the MFA challenge, the user returns to the board but has to repeat the move they started.                     | Medium   | Open: replay the pending move after a successful challenge (Sprint 3 polish)                    |
| 2   | Each board card has two Tab stops (state select, Move button). A full column means many Tab presses to get past it. | Medium   | Open: add roving focus inside columns, with arrow keys between cards                            |
| 3   | The board has 14 columns, so Verified and Closed sit off-screen at 1280 px.                                         | Low      | Open: collapse empty columns while not dragging                                                 |
| 4   | Dragging is mouse-only.                                                                                             | —        | By design: every drag has a keyboard equivalent (the Move control), which this walkthrough uses |
| 5   | The cockpit home page still shows the Sprint 0 sample data.                                                         | Low      | Expected: replaced as agents and repositories arrive (Sprints 3–6)                              |

Open items are tracked in the Sprint 3 backlog. This walkthrough is re-run at each milestone (M2, M5, M6) as the test plan requires.
