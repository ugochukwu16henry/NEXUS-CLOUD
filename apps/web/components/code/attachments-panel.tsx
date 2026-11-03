"use client";

import { useId } from "react";
import { UploadProgress } from "./upload-panel";
import { useUploader } from "./use-uploader";

/**
 * Attach pictures and documents to a task: pick files, or paste a screenshot straight from the
 * clipboard (Ctrl+V while this box has focus).
 */
export function AttachmentsPanel({
  projectId,
  taskId,
  maxMb,
}: {
  projectId: string;
  taskId: string;
  maxMb: number;
}) {
  const { status, upload } = useUploader(projectId, taskId, "attachment");
  const inputId = useId();
  const busy =
    status.phase === "preparing" || status.phase === "uploading" || status.phase === "checking";

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Add attachments: choose files or paste a screenshot"
      className="space-y-2 rounded border border-dashed border-nx-border p-2 text-xs focus:outline focus:outline-2 focus:outline-nx-blue"
      onPaste={async (event) => {
        const images = [...event.clipboardData.files];
        if (images.length === 0 || busy) return;
        event.preventDefault();
        const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
        await upload(
          images.map((file, index) => ({
            file,
            path:
              file.name && file.name !== "image.png"
                ? file.name
                : `Screenshot ${stamp}${index ? `-${index}` : ""}.png`,
          })),
        );
      }}
    >
      <label
        htmlFor={inputId}
        className="inline-block cursor-pointer rounded border border-nx-border px-2 py-1 hover:border-nx-blue focus-within:outline focus-within:outline-2 focus-within:outline-nx-blue"
      >
        Add files
        <input
          id={inputId}
          type="file"
          multiple
          disabled={busy}
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,.md,.csv,.json"
          className="sr-only"
          onChange={async (event) => {
            const list = [...(event.target.files ?? [])].map((file) => ({ file, path: file.name }));
            event.target.value = "";
            await upload(list);
          }}
        />
      </label>
      <p className="text-nx-muted">
        Pictures, PDFs and text, up to {maxMb} MB each. Click here and paste to add a screenshot.
      </p>
      <UploadProgress status={status} />
    </div>
  );
}
