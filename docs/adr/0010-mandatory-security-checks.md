# ADR 0010: Mandatory security checks for every project

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decider:** Henry Ugochukwu (owner)

## Context

Phase 0 decision: which security checks are mandatory.

## Decision

Every pull request (Nexus itself and every managed project) runs secret scanning (gitleaks), dependency scanning (OSV-Scanner) and SAST (Semgrep). Container image scanning (Trivy) runs when a Dockerfile changes. Critical and high findings block release unless the owner records a time-limited exception. Security testing only targets owned or explicitly permitted assets.

## Consequences

Some false positives must be triaged. AI review supplements these scanners and never replaces them.
