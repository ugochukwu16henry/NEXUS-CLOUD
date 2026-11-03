"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { IDLE_STATE, type ActionState } from "@/lib/action-state";
import { UploadProgress } from "./upload-panel";
import { MicIcon, useVoiceInput } from "./use-voice";
import { filesFromDrop, useUploader } from "./use-uploader";
import { filesFromZip, ZipTooLargeError } from "./zip";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The agent's message box: type what the agent should do, or hold a conversation with the mic.
 * The mic uses the browser's own speech recognition where it has one; otherwise it records and
 * the server transcribes it (Groq Whisper, then OpenAI). The + button adds files, a folder or a
 * zip to the task's changes (what the agent works on), or pictures and PDFs to the task.
 */
export function AgentComposer({
  action,
  projectId,
  taskId,
  idempotencyKey,
  defaultPurpose,
  canAddFiles,
  limits,
}: {
  action: Action;
  projectId: string;
  taskId: string;
  idempotencyKey: string;
  defaultPurpose: string;
  /** False until the task has a branch: files the agent edits live in its change set. */
  canAddFiles: boolean;
  limits: { maxFileMb: number; maxUploadMb: number; maxFiles: number };
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [text, setText] = useState(defaultPurpose);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const worktree = useUploader(projectId, taskId, "worktree");
  const attachments = useUploader(projectId, taskId, "attachment");
  const { listening, micLabel, voiceNote, voiceError, setVoiceError, toggle } = useVoiceInput(
    projectId,
    text,
    setText,
  );
  const ids = { box: useId(), files: useId(), folder: useId(), zip: useId(), pictures: useId() };
  const busy =
    pending ||
    ["preparing", "uploading", "checking"].includes(worktree.status.phase) ||
    ["preparing", "uploading", "checking"].includes(attachments.status.phase);

  useEffect(() => {
    if (state.status === "success") setText("");
  }, [state]);

  const pick = (input: HTMLInputElement, folder: boolean) =>
    [...(input.files ?? [])].map((file) => ({
      file,
      path: folder ? file.webkitRelativePath || file.name : file.name,
    }));

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        className={`rounded-xl border bg-nx-raised p-2 ${dragging ? "border-nx-teal" : "border-nx-border"}`}
        onDragOver={(event) => {
          if (!canAddFiles) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (event) => {
          if (!canAddFiles) return;
          event.preventDefault();
          setDragging(false);
          if (!busy) await worktree.upload(await filesFromDrop(event.dataTransfer.items));
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <label htmlFor={ids.box} className="sr-only">
          What should the agent do?
        </label>
        <textarea
          id={ids.box}
          name="purpose"
          required
          maxLength={4000}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Describe the work, or tap the mic and say it"
          className="block max-h-60 min-h-12 w-full resize-y bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-nx-muted"
        />
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <button
              type="button"
              aria-label="Attach files or pictures"
              aria-expanded={menuOpen}
              aria-controls={`${ids.box}-menu`}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-nx-border text-xl leading-none hover:border-nx-blue"
            >
              <span aria-hidden="true">+</span>
            </button>
            {menuOpen && (
              <div
                id={`${ids.box}-menu`}
                role="group"
                aria-label="Add to this task"
                className="absolute bottom-11 left-0 z-20 w-64 space-y-1 rounded-lg border border-nx-border bg-nx-surface p-2 text-sm shadow-lg"
              >
                {canAddFiles ? (
                  <>
                    <MenuFile
                      id={ids.files}
                      label="Files"
                      multiple
                      onPick={async (input) => {
                        setMenuOpen(false);
                        await worktree.upload(pick(input, false));
                      }}
                    />
                    <MenuFile
                      id={ids.folder}
                      label="Folder"
                      folder
                      onPick={async (input) => {
                        setMenuOpen(false);
                        await worktree.upload(pick(input, true));
                      }}
                    />
                    <MenuFile
                      id={ids.zip}
                      label="Zipped folder (.zip)"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      onPick={async (input) => {
                        setMenuOpen(false);
                        const zip = input.files?.[0];
                        if (!zip) return;
                        try {
                          const { files, skipped } = await filesFromZip(zip, limits);
                          await worktree.upload(
                            files,
                            skipped.map((item) => `Skipped ${item}`),
                          );
                        } catch (error) {
                          setVoiceError(
                            error instanceof ZipTooLargeError
                              ? error.message
                              : "That file isn't a zip Nexus can read.",
                          );
                        }
                      }}
                    />
                  </>
                ) : (
                  <p className="px-2 py-1 text-xs text-nx-muted">
                    To add code files, start a branch for this task on the Code tab.
                  </p>
                )}
                <MenuFile
                  id={ids.pictures}
                  label="Pictures or PDFs for the task"
                  multiple
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.md"
                  onPick={async (input) => {
                    setMenuOpen(false);
                    await attachments.upload(pick(input, false));
                  }}
                />
              </div>
            )}
          </div>
          <span className="flex-1 truncate text-xs text-nx-muted" aria-live="polite">
            {listening === "dictating" || listening === "recording"
              ? "Listening… tap the mic to stop"
              : listening === "transcribing"
                ? "Transcribing…"
                : ""}
          </span>
          <button
            type="button"
            aria-label={micLabel}
            aria-pressed={listening === "dictating" || listening === "recording"}
            disabled={listening === "transcribing"}
            onClick={toggle}
            className={`flex h-9 w-9 items-center justify-center rounded-full border ${
              listening === "off" || listening === "transcribing"
                ? "border-nx-border text-nx-text hover:border-nx-blue"
                : "animate-pulse border-nx-danger bg-nx-danger/20 text-nx-danger"
            }`}
          >
            <MicIcon />
          </button>
          <button
            type="submit"
            disabled={busy || text.trim().length === 0}
            className="rounded-full bg-nx-teal px-4 py-1.5 text-sm font-semibold text-nx-bg disabled:opacity-50"
          >
            {pending ? "Planning…" : "Plan"}
          </button>
        </div>
      </form>
      <FormMessage state={state} />
      {voiceNote && (
        <p role="status" className="text-xs text-nx-ok">
          {voiceNote}
        </p>
      )}
      {voiceError && (
        <p role="alert" className="text-xs text-nx-danger">
          {voiceError}
        </p>
      )}
      <UploadProgress status={worktree.status} />
      <UploadProgress status={attachments.status} />
    </div>
  );
}

function MenuFile({
  id,
  label,
  multiple,
  folder,
  accept,
  onPick,
}: {
  id: string;
  label: string;
  multiple?: boolean;
  folder?: boolean;
  accept?: string;
  onPick: (input: HTMLInputElement) => Promise<void>;
}) {
  return (
    <label
      htmlFor={id}
      className="block cursor-pointer rounded px-2 py-1.5 hover:bg-nx-raised focus-within:outline focus-within:outline-2 focus-within:outline-nx-blue"
    >
      {label}
      <input
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        {...(folder ? { webkitdirectory: "", directory: "" } : {})}
        onChange={async (event) => {
          const input = event.currentTarget;
          await onPick(input);
          input.value = "";
        }}
      />
    </label>
  );
}
