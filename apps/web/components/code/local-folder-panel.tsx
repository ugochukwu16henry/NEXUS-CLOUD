"use client";

import { useEffect, useState } from "react";
import { buttonSecondary } from "@/components/ui/fields";
import { announce } from "@/components/ui/announcer";
import { UploadProgress } from "./upload-panel";
import { useUploader } from "./use-uploader";
import { readZip, sha256Hex } from "./zip";

/**
 * Work in a folder on this computer (Chrome and Edge on desktop; phones have no folder access).
 * "Bring into folder" writes the task's files (the repository plus its changes) into the folder,
 * so an empty folder becomes a local copy. "Send to Nexus" uploads the files that differ from the
 * task, through the normal upload checks. Files are compared by content; nothing is deleted on
 * either side, and the folder is only touched when you press a button.
 */

type FileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
};
type DirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileHandle | DirectoryHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
};
type Picker = (options: { mode: "readwrite"; id?: string }) => Promise<DirectoryHandle>;

const NO_LIMIT = { maxFiles: 200_000, maxUploadMb: 4096, maxFileMb: 1024 };

async function readFolder(
  dir: DirectoryHandle,
  skip: ReadonlySet<string>,
  prefix = "",
  out = new Map<string, File>(),
): Promise<Map<string, File>> {
  for await (const entry of dir.values()) {
    if (skip.has(entry.name)) continue;
    if (entry.kind === "directory") await readFolder(entry, skip, `${prefix}${entry.name}/`, out);
    else out.set(prefix + entry.name, await entry.getFile());
  }
  return out;
}

async function writeFile(root: DirectoryHandle, path: string, bytes: Uint8Array) {
  const parts = path.split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export function LocalFolderPanel({
  projectId,
  taskId,
  skipFolders,
}: {
  projectId: string;
  taskId: string;
  skipFolders: readonly string[];
}) {
  const [supported, setSupported] = useState(false);
  const [folder, setFolder] = useState<DirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const { status, upload } = useUploader(projectId, taskId, "worktree");
  const skip = new Set([".git", ...skipFolders]);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

  async function taskFiles(): Promise<Map<string, Uint8Array>> {
    const response = await fetch(`/projects/${projectId}/code/export?task=${taskId}`);
    if (!response.ok) throw new Error(await response.text());
    const { files } = readZip(new Uint8Array(await response.arrayBuffer()), NO_LIMIT);
    return new Map(files.map((file) => [file.path, file.bytes]));
  }

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      setMessage({ kind: "status", text });
      announce(text);
    } catch (error) {
      setMessage({
        kind: "alert",
        text:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "The browser didn't allow access to that folder."
            : error instanceof Error && error.message
              ? error.message
              : "That didn't work. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="mx-2 text-xs text-nx-muted">
        To work in a folder on your computer, open Nexus in Chrome or Edge on a laptop. On a phone,
        use Upload .zip and Download .zip.
      </p>
    );
  }

  return (
    <section aria-labelledby="local-folder-heading" className="m-2 space-y-2 text-xs">
      <h2 id="local-folder-heading" className="font-semibold">
        Folder on this computer
      </h2>
      {folder ? (
        <p>
          Working with <span className="font-mono">{folder.name}</span>
        </p>
      ) : (
        <p className="text-nx-muted">
          Pick a folder to copy this task into, or one that already holds your copy.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonSecondary}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const picker = (window as unknown as { showDirectoryPicker: Picker })
                .showDirectoryPicker;
              const picked = await picker({ mode: "readwrite", id: `nexus-${projectId}` });
              setFolder(picked);
              return `Folder ${picked.name} is ready.`;
            })
          }
        >
          {folder ? "Pick another folder" : "Open a folder"}
        </button>
        {folder && (
          <>
            <button
              type="button"
              className={buttonSecondary}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const [remote, local] = await Promise.all([
                    taskFiles(),
                    readFolder(folder, skip),
                  ]);
                  let written = 0;
                  for (const [path, bytes] of remote) {
                    const mine = local.get(path);
                    if (
                      mine &&
                      (await sha256Hex(await mine.arrayBuffer())) === (await sha256Hex(bytes))
                    )
                      continue;
                    await writeFile(folder, path, bytes);
                    written += 1;
                  }
                  return written === 0
                    ? "The folder already matches this task."
                    : `Wrote ${written} file(s) into ${folder.name}.`;
                })
              }
            >
              Bring into folder
            </button>
            <button
              type="button"
              className={buttonSecondary}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const [remote, local] = await Promise.all([
                    taskFiles(),
                    readFolder(folder, skip),
                  ]);
                  const changed: { file: File; path: string }[] = [];
                  for (const [path, file] of local) {
                    const theirs = remote.get(path);
                    if (
                      theirs &&
                      (await sha256Hex(theirs)) === (await sha256Hex(await file.arrayBuffer()))
                    )
                      continue;
                    changed.push({ file, path });
                  }
                  if (changed.length === 0) return "Nothing in the folder differs from this task.";
                  await upload(changed);
                  return `Sent ${changed.length} changed file(s) to Nexus.`;
                })
              }
            >
              Send to Nexus
            </button>
          </>
        )}
      </div>
      {message && (
        <p
          role={message.kind}
          className={message.kind === "alert" ? "text-nx-danger" : "text-nx-ok"}
        >
          {message.text}
        </p>
      )}
      <UploadProgress status={status} />
    </section>
  );
}
