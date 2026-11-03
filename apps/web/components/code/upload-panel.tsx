"use client";

import { useId, useState } from "react";
import { filesFromDrop, useUploader, type UploadStatus } from "./use-uploader";

export function UploadProgress({ status }: { status: UploadStatus }) {
  if (status.phase === "idle") return null;
  return (
    <div className="space-y-1 text-xs" aria-live="polite">
      {status.phase === "preparing" && <p>Checking {status.total} file(s)…</p>}
      {status.phase === "uploading" && (
        <>
          <p>
            Uploading {status.done} of {status.total}…
          </p>
          <progress
            max={status.total}
            value={status.done}
            className="w-full"
            aria-label="Upload progress"
          />
        </>
      )}
      {status.phase === "checking" && <p>Checking {status.total} uploaded file(s)…</p>}
      {(status.phase === "done" || status.phase === "error") && (
        <>
          <p
            role={status.phase === "error" ? "alert" : "status"}
            className={status.phase === "error" ? "text-nx-danger" : "text-nx-ok"}
          >
            {status.message}
          </p>
          {status.notes.length > 0 && (
            <details>
              <summary className="cursor-pointer text-nx-muted">
                {status.notes.length} note(s)
              </summary>
              <ul
                className="mt-1 max-h-32 space-y-0.5 overflow-auto text-nx-muted"
                aria-label="Upload notes"
              >
                {status.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Upload files or whole folders into the task's changes: pick files, pick a folder, or drag and
 * drop either. Folder structure is kept; node_modules and similar are skipped (Workspace settings).
 */
export function UploadPanel({
  projectId,
  taskId,
  limits,
}: {
  projectId: string;
  taskId: string;
  limits: { maxFileMb: number; maxUploadMb: number; maxFiles: number };
}) {
  const { status, upload } = useUploader(projectId, taskId, "worktree");
  const [dragging, setDragging] = useState(false);
  const filesId = useId();
  const folderId = useId();
  const busy =
    status.phase === "preparing" || status.phase === "uploading" || status.phase === "checking";

  return (
    <div
      className={`m-2 space-y-2 rounded border border-dashed p-2 text-xs ${dragging ? "border-nx-teal bg-nx-raised" : "border-nx-border"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) await upload(await filesFromDrop(event.dataTransfer.items));
      }}
      data-testid="upload-dropzone"
    >
      <p className="text-nx-muted">Drop files or folders here, or:</p>
      <div className="flex gap-2">
        <label
          htmlFor={filesId}
          className="cursor-pointer rounded border border-nx-border px-2 py-1 hover:border-nx-blue focus-within:outline focus-within:outline-2 focus-within:outline-nx-blue"
        >
          Upload files
          <input
            id={filesId}
            type="file"
            multiple
            disabled={busy}
            className="sr-only"
            onChange={async (event) => {
              const list = [...(event.target.files ?? [])].map((file) => ({
                file,
                path: file.name,
              }));
              event.target.value = "";
              await upload(list);
            }}
          />
        </label>
        <label
          htmlFor={folderId}
          className="cursor-pointer rounded border border-nx-border px-2 py-1 hover:border-nx-blue focus-within:outline focus-within:outline-2 focus-within:outline-nx-blue"
        >
          Upload folder
          <input
            id={folderId}
            type="file"
            disabled={busy}
            className="sr-only"
            // Non-standard but supported by every current browser: pick a whole folder.
            {...{ webkitdirectory: "", directory: "" }}
            onChange={async (event) => {
              const list = [...(event.target.files ?? [])].map((file) => ({
                file,
                path: file.webkitRelativePath || file.name,
              }));
              event.target.value = "";
              await upload(list);
            }}
          />
        </label>
      </div>
      <p className="text-nx-muted">
        Up to {limits.maxFiles} files, {limits.maxFileMb} MB each, {limits.maxUploadMb} MB in total.
      </p>
      <UploadProgress status={status} />
    </div>
  );
}
