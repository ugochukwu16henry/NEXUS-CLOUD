"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useActionState, useEffect, useRef } from "react";
import { saveFile } from "@/app/(cockpit)/projects/[projectId]/code/actions";
import { FormMessage } from "@/components/form-message";
import { announce } from "@/components/ui/announcer";
import { buttonPrimary } from "@/components/ui/fields";
import { IDLE_STATE } from "@/lib/action-state";

function languageFor(path: string): Extension[] {
  const ext = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (["ts", "tsx", "mts", "cts"].includes(ext))
    return [javascript({ typescript: true, jsx: ext === "tsx" })];
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return [javascript({ jsx: ext === "jsx" })];
  if (ext === "json") return [json()];
  if (["css", "scss"].includes(ext)) return [css()];
  if (["html", "htm"].includes(ext)) return [html()];
  if (["md", "mdx"].includes(ext)) return [markdown()];
  return [];
}

/** Colours come from the design tokens, so the editor follows the active theme. */
const theme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--color-nx-bg)", color: "var(--color-nx-text)", fontSize: "13px" },
    ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--color-nx-teal)" },
    ".cm-gutters": {
      backgroundColor: "var(--color-nx-surface)",
      color: "var(--color-nx-muted)",
      border: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--color-nx-raised) 60%, transparent)",
    },
    "&.cm-focused": { outline: "2px solid var(--color-nx-blue)" },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--color-nx-blue) 35%, transparent)",
    },
    ".cm-panels": { backgroundColor: "var(--color-nx-surface)", color: "var(--color-nx-text)" },
  },
  { dark: true },
);

/**
 * Syntax colours from the design tokens. Every token colour meets 4.5:1 on the editor background
 * (packages/ui/tokens.test.ts), unlike CodeMirror's default style, which is made for light themes.
 */
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: "var(--color-nx-teal)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--color-nx-ok)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--color-nx-warn)" },
  { tag: [tags.comment, tags.meta], color: "var(--color-nx-muted)", fontStyle: "italic" },
  {
    tag: [tags.function(tags.variableName), tags.typeName, tags.className, tags.tagName],
    color: "var(--color-nx-blue)",
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.variableName, tags.punctuation],
    color: "var(--color-nx-text)",
  },
  { tag: tags.heading, color: "var(--color-nx-teal)", fontWeight: "600" },
  { tag: tags.invalid, color: "var(--color-nx-danger)" },
]);

export function CodeEditor({
  projectId,
  changesetId,
  path,
  initial,
  readOnly,
  readOnlyReason,
}: {
  projectId: string;
  changesetId: string | null;
  path: string;
  initial: string;
  readOnly: boolean;
  readOnlyReason?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const contentField = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // Saving refreshes the page and remounts the editor, so success is announced app-wide instead of
  // shown inline (it would vanish with the old form). Errors stay inline: nothing remounts then.
  const [state, save, saving] = useActionState(
    async (previous: Parameters<typeof saveFile>[0], formData: FormData) => {
      const result = await saveFile(previous, formData);
      if (result.status === "success" && result.message) {
        announce(result.message);
        return IDLE_STATE;
      }
      return result;
    },
    IDLE_STATE,
  );

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(highlight),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                form.current?.requestSubmit();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ "aria-label": `Contents of ${path}` }),
          theme,
          ...languageFor(path),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, [initial, path, readOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {readOnly ? (
        <p className="border-b border-nx-border px-3 py-1.5 text-xs text-nx-muted">
          Read-only{readOnlyReason ? `: ${readOnlyReason}` : ""}
        </p>
      ) : (
        <form
          ref={form}
          action={save}
          onSubmit={() => {
            if (contentField.current && view.current) {
              contentField.current.value = view.current.state.doc.toString();
            }
          }}
          className="flex items-center gap-3 border-b border-nx-border px-3 py-1.5"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="changesetId" value={changesetId ?? ""} />
          <input type="hidden" name="path" value={path} />
          <input ref={contentField} type="hidden" name="content" defaultValue={initial} />
          <button type="submit" disabled={saving} className={buttonPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="text-xs text-nx-muted">Ctrl+S · Ctrl+F to find and replace</span>
          <FormMessage state={state} />
        </form>
      )}
      <div ref={host} className="min-h-0 flex-1 overflow-auto" data-testid="code-editor" />
    </div>
  );
}
