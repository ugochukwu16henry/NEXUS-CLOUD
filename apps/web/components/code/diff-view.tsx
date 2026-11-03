"use client";

import type { FileDiff } from "@nexus/workspace";
import { useState } from "react";

const ROW = {
  added: "bg-nx-ok/10",
  removed: "bg-nx-danger/10",
  context: "",
} as const;
const SIGN = { added: "+", removed: "−", context: " " } as const;

/**
 * A file's diff, inline or side by side. Every changed line has a +/− marker and a screen-reader
 * label, so colour is never the only signal (test plan, Sprint 4 accessibility).
 */
export function DiffView({ path, diff }: { path: string; diff: FileDiff }) {
  const [mode, setMode] = useState<"inline" | "split">("inline");

  if (diff.hunks.length === 0) return <p className="p-3 text-sm text-nx-muted">No differences.</p>;

  return (
    <section aria-label={`Changes to ${path}`} className="text-xs">
      <div className="flex items-center gap-3 border-b border-nx-border px-3 py-1.5">
        <span>
          <span className="text-nx-ok">+{diff.added}</span>{" "}
          <span className="text-nx-danger">−{diff.removed}</span>
          <span className="sr-only">
            {diff.added} lines added, {diff.removed} removed
          </span>
        </span>
        <div role="group" aria-label="Diff layout" className="ml-auto flex gap-1">
          {(["inline", "split"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded border px-2 py-0.5 ${mode === value ? "border-nx-blue text-nx-text" : "border-nx-border text-nx-muted"}`}
            >
              {value === "inline" ? "Inline" : "Side by side"}
            </button>
          ))}
        </div>
      </div>
      {diff.hunks.map((hunk) => (
        <div key={hunk.header} className="font-mono">
          <p className="bg-nx-panel px-3 py-0.5 text-nx-muted">{hunk.header}</p>
          {mode === "inline" ? (
            <table className="w-full border-collapse">
              <tbody>
                {hunk.lines.map((line, index) => (
                  <tr key={index} className={ROW[line.kind]}>
                    <td className="w-10 select-none px-1 text-right text-nx-muted">
                      {line.oldLine ?? ""}
                    </td>
                    <td className="w-10 select-none px-1 text-right text-nx-muted">
                      {line.newLine ?? ""}
                    </td>
                    <td
                      className="w-4 select-none text-center"
                      aria-label={line.kind === "context" ? undefined : line.kind}
                    >
                      {SIGN[line.kind]}
                    </td>
                    <td className="whitespace-pre-wrap break-all pr-3">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {pairUp(hunk.lines).map(([left, right], index) => (
                  <tr key={index}>
                    <td className="w-10 select-none px-1 text-right text-nx-muted">
                      {left?.oldLine ?? ""}
                    </td>
                    <td
                      className={`whitespace-pre-wrap break-all pr-2 ${left ? ROW[left.kind] : ""}`}
                    >
                      {left && <span aria-hidden="true">{SIGN[left.kind]} </span>}
                      {left?.kind === "removed" && <span className="sr-only">removed: </span>}
                      {left?.text}
                    </td>
                    <td className="w-10 select-none px-1 text-right text-nx-muted">
                      {right?.newLine ?? ""}
                    </td>
                    <td
                      className={`whitespace-pre-wrap break-all pr-2 ${right ? ROW[right.kind] : ""}`}
                    >
                      {right && <span aria-hidden="true">{SIGN[right.kind]} </span>}
                      {right?.kind === "added" && <span className="sr-only">added: </span>}
                      {right?.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}

type Line = FileDiff["hunks"][number]["lines"][number];

/** Lines laid out in two columns: context on both sides, removals left, additions right. */
function pairUp(lines: Line[]): [Line | null, Line | null][] {
  const rows: [Line | null, Line | null][] = [];
  let removed: Line[] = [];
  let added: Line[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      rows.push([removed[i] ?? null, added[i] ?? null]);
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === "removed") removed.push(line);
    else if (line.kind === "added") added.push(line);
    else {
      flush();
      rows.push([line, line]);
    }
  }
  flush();
  return rows;
}
