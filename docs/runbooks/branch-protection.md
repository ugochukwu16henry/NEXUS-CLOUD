# Runbook: make CI block merges to `main`

The Sprint 0 exit criterion is that **CI blocks on failing tests and secrets**. Workflows run on every push, but they only _block_ once `main` is protected and their checks are required. Without that, a red run only reports a problem after the code has landed.

## 1. Protect `main` (GitHub → repository → Settings → Rules → Rulesets)

1. **New ruleset → New branch ruleset.** Name it `main`, set **Enforcement** to _Active_, and under **Target branches** add the default branch.
2. Tick these rules:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging** (0 approvals is fine for a solo owner; it still forces changes through CI)
   - **Require status checks to pass**, with _Require branches to be up to date_ on, adding these checks (they appear once each has run on a pull request):
     - `Static checks, unit tests, build`
     - `Migrations and RLS tests`
     - `Hub API database tests`
     - `E2E and accessibility`
     - `Secret scan (gitleaks)`
     - `Dependency scan (OSV-Scanner)`
     - `SAST (Semgrep)`
3. Leave the **Bypass list** empty. With yourself on it, the protection becomes optional.

## 2. Let Claude open pull requests from this machine

Once `main` is protected, work lands through pull requests. Install the GitHub CLI and sign in once:

```bash
winget install --id GitHub.cli
```

```bash
gh auth login
```

## 3. Check it works

Open a pull request that breaks a unit test: the **Merge** button stays disabled until it is fixed. The CI evidence for Sprint 0 (a red run for a failing test and for a planted fake secret) is recorded in [`docs/evidence/ci-gate-proof.md`](../evidence/ci-gate-proof.md).
