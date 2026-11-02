"""Turns Semgrep JSON output into GitHub annotations so findings show on the run and the PR diff.

Usage: python scripts/semgrep-annotate.py semgrep.json
Exits 1 when Semgrep reported findings or errors (gate G3).
"""
import json
import sys

LEVELS = {"ERROR": "error", "WARNING": "warning", "INFO": "notice"}


def escape(text):
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


with open(sys.argv[1], encoding="utf-8") as f:
    report = json.load(f)

results = report.get("results", [])
errors = report.get("errors", [])

for r in results:
    extra = r.get("extra", {})
    level = LEVELS.get(extra.get("severity", "WARNING"), "warning")
    message = escape(f"{r['check_id']}: {extra.get('message', '')}")
    print(f"::{level} file={r['path']},line={r['start']['line']},title=Semgrep::{message}")

for e in errors:
    print(f"::error title=Semgrep error::{escape(e.get('message', str(e)))[:1000]}")

print(f"Semgrep: {len(results)} finding(s), {len(errors)} error(s)")
sys.exit(1 if results or errors else 0)
