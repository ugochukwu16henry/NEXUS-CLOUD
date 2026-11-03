import { structuredPatch } from "diff";

/** One line of a diff, with the old and new line numbers (null on the side it doesn't exist). */
export type DiffLine = {
  kind: "context" | "added" | "removed";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};
export type DiffHunk = { header: string; lines: DiffLine[] };
export type FileDiff = { added: number; removed: number; hunks: DiffHunk[] };

/**
 * A line diff between two versions of a text file, as hunks with three lines of context. Both
 * the inline and the side-by-side view render from this; every line also carries a +/− marker,
 * so colour is never the only signal.
 */
export function diffText(before: string, after: string): FileDiff {
  const patch = structuredPatch("a", "b", before, after, "", "", { context: 3 });
  let added = 0;
  let removed = 0;
  const hunks = patch.hunks.map((hunk) => {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    const lines: DiffLine[] = [];
    for (const raw of hunk.lines) {
      if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
      const text = raw.slice(1);
      if (raw[0] === "+") {
        added += 1;
        lines.push({ kind: "added", text, oldLine: null, newLine: newLine++ });
      } else if (raw[0] === "-") {
        removed += 1;
        lines.push({ kind: "removed", text, oldLine: oldLine++, newLine: null });
      } else {
        lines.push({ kind: "context", text, oldLine: oldLine++, newLine: newLine++ });
      }
    }
    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines,
    };
  });
  return { added, removed, hunks };
}
