"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ExplorerFile = {
  path: string;
  change: "add" | "modify" | "delete" | null;
  held: boolean;
};

type Folder = { name: string; path: string; folders: Map<string, Folder>; files: ExplorerFile[] };

function buildTree(files: ExplorerFile[]): Folder {
  const root: Folder = { name: "", path: "", folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      if (!folder.folders.has(part))
        folder.folders.set(part, { name: part, path, folders: new Map(), files: [] });
      folder = folder.folders.get(part)!;
    }
    folder.files.push(file);
  }
  return root;
}

const MARKS = {
  add: ["A", "text-nx-ok", "added"],
  modify: ["M", "text-nx-warn", "changed"],
  delete: ["D", "text-nx-danger", "deleted"],
} as const;

/**
 * The file tree: folders open and close with a button (keyboard and screen-reader friendly),
 * changed files carry a letter as well as a colour (A added, M changed, D deleted), and the
 * filter box narrows the tree by path.
 */
export function Explorer({
  files,
  linkBase,
  selected,
}: {
  files: ExplorerFile[];
  /** Page URL with its query so far; the file's path is appended as `path=`. */
  linkBase: string;
  selected: string | null;
}) {
  const hrefFor = (path: string) =>
    `${linkBase}${linkBase.includes("?") ? "&" : "?"}path=${encodeURIComponent(path)}`;
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? files.filter((file) => file.path.toLowerCase().includes(needle)) : files;
  }, [files, filter]);
  const tree = useMemo(() => buildTree(visible), [visible]);

  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderFolder = (folder: Folder, depth: number) => (
    <ul className="text-sm" aria-label={depth === 0 ? "Files" : undefined}>
      {[...folder.folders.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => {
          const open = filter.trim() !== "" || !closed.has(child.path);
          return (
            <li key={child.path}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(child.path)}
                className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-nx-muted hover:text-nx-text"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <span aria-hidden="true" className="w-3 font-mono text-xs">
                  {open ? "▾" : "▸"}
                </span>
                {child.name}
              </button>
              {open && renderFolder(child, depth + 1)}
            </li>
          );
        })}
      {folder.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => {
          const name = file.path.split("/").at(-1);
          const mark = file.change ? MARKS[file.change] : null;
          return (
            <li key={file.path}>
              <Link
                href={hrefFor(file.path)}
                aria-current={selected === file.path ? "page" : undefined}
                className={`flex items-center justify-between gap-2 px-2 py-0.5 ${
                  selected === file.path
                    ? "bg-nx-raised text-nx-text"
                    : "text-nx-muted hover:text-nx-text"
                } ${file.change === "delete" ? "line-through" : ""}`}
                style={{ paddingLeft: `${depth * 12 + 20}px` }}
              >
                <span className="truncate">{name}</span>
                {mark && (
                  <span className={`font-mono text-xs ${mark[1]}`}>
                    {file.held ? "!" : ""}
                    {mark[0]}
                    <span className="sr-only">
                      {" "}
                      ({mark[2]}
                      {file.held ? ", held back" : ""})
                    </span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <label className="sr-only" htmlFor="explorer-filter">
        Filter files
      </label>
      <input
        id="explorer-filter"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter files"
        className="m-2 rounded border border-nx-border bg-nx-bg px-2 py-1 text-sm"
      />
      <nav aria-label="File explorer" className="min-h-0 flex-1 overflow-auto pb-4">
        {visible.length === 0 ? (
          <p className="px-3 text-sm text-nx-muted">No files match.</p>
        ) : (
          renderFolder(tree, 0)
        )}
      </nav>
    </div>
  );
}
