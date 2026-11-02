"""Turns a gitleaks JSON report into GitHub annotations (secret values are never printed).

Usage: python scripts/gitleaks-annotate.py gitleaks.json
Exits 1 when gitleaks reported findings (gate G3).
"""
import json
import sys


def escape_property(text):
    return (
        text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A").replace(":", "%3A").replace(",", "%2C")
    )


try:
    with open(sys.argv[1], encoding="utf-8") as f:
        findings = json.load(f) or []
except FileNotFoundError:
    print("::error title=gitleaks::No report produced; see the scan step log")
    sys.exit(1)

for finding in findings:
    path = escape_property(finding.get("File", ""))
    line = finding.get("StartLine", 1)
    commit = finding.get("Commit", "")[:12]
    rule = finding.get("RuleID", "unknown")
    print(f"::error file={path},line={line},title=gitleaks {rule}::Possible secret ({rule}) in commit {commit}. Fingerprint: {finding.get('Fingerprint', '')}")

print(f"gitleaks: {len(findings)} finding(s)")
sys.exit(1 if findings else 0)
