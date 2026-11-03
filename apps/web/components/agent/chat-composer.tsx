"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { UploadProgress } from "@/components/code/upload-panel";
import { filesFromDrop, useUploader, type PickedFile } from "@/components/code/use-uploader";
import { MicIcon, useVoiceInput } from "@/components/code/use-voice";
import { filesFromZip, ZipTooLargeError } from "@/components/code/zip";
import { IDLE_STATE, type ActionState } from "@/lib/action-state";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The message box of a project's Agent chat: type or speak, and + to add files, a folder, a zip,
 * or pictures and PDFs. Added files belong to this project and go with the next message.
 */
export function ChatComposer({
  action,
  projectId,
  models,
  limits,
}: {
  action: Action;
  projectId: string;
  models: { value: string; label: string }[];
  limits: { maxFileMb: number; maxUploadMb: number; maxFiles: number };
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attached, setAttached] = useState<{ ids: string[]; names: string[] }>({
    ids: [],
    names: [],
  });
  const uploader = useUploader(projectId, null, "chat");
  const { listening, micLabel, voiceNote, voiceError, setVoiceError, toggle } = useVoiceInput(
    projectId,
    text,
    setText,
  );
  const ids = { box: useId(), files: useId(), folder: useId(), zip: useId(), model: useId() };
  const uploading = ["preparing", "uploading", "checking"].includes(uploader.status.phase);

  useEffect(() => {
    if (state.status === "success") {
      setText("");
      setAttached({ ids: [], names: [] });
    }
  }, [state]);

  async function add(files: PickedFile[], notes: string[] = []) {
    setMenuOpen(false);
    const kept = await uploader.upload(files, notes);
    if (kept.length === 0) return;
    setAttached((current) => ({
      ids: [...current.ids, ...kept],
      names: [...current.names, ...files.map((file) => file.path)].slice(0, 500),
    }));
  }

  const pick = (input: HTMLInputElement, folder: boolean) =>
    [...(input.files ?? [])].map((file) => ({
      file,
      path: folder ? file.webkitRelativePath || file.name : file.name,
    }));

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        className={`rounded-2xl border bg-nx-raised p-2 shadow-lg ${dragging ? "border-nx-teal" : "border-nx-border"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (event) => {
          event.preventDefault();
          setDragging(false);
          if (!uploading) await add(await filesFromDrop(event.dataTransfer.items));
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="fileIds" value={JSON.stringify(attached.ids)} />
        {attached.ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2 text-xs">
            <span className="rounded-full border border-nx-border px-2 py-0.5">
              {attached.ids.length} file{attached.ids.length === 1 ? "" : "s"} ready to send
            </span>
            <span className="max-w-full truncate text-nx-muted">
              {attached.names.slice(0, 3).join(", ")}
              {attached.names.length > 3 ? ` and ${attached.names.length - 3} more` : ""}
            </span>
            <button
              type="button"
              className="text-nx-blue underline"
              onClick={() => setAttached({ ids: [], names: [] })}
            >
              Remove
            </button>
          </div>
        )}
        <label htmlFor={ids.box} className="sr-only">
          Message the agent
        </label>
        <textarea
          id={ids.box}
          name="content"
          required
          maxLength={8000}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message the agent, or tap the mic and talk"
          className="block max-h-60 min-h-12 w-full resize-y bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-nx-muted"
        />
        <div className="flex items-center gap-2 pt-1">
          <div className="relative">
            <button
              type="button"
              aria-label="Add files to the conversation"
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
                aria-label="Add to the conversation"
                className="absolute bottom-11 left-0 z-20 w-60 space-y-1 rounded-lg border border-nx-border bg-nx-surface p-2 text-sm shadow-lg"
              >
                <MenuFile
                  id={ids.files}
                  label="Files or pictures"
                  multiple
                  onPick={(input) => add(pick(input, false))}
                />
                <MenuFile
                  id={ids.folder}
                  label="Folder"
                  folder
                  onPick={(input) => add(pick(input, true))}
                />
                <MenuFile
                  id={ids.zip}
                  label="Zipped folder (.zip)"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onPick={async (input) => {
                    const zip = input.files?.[0];
                    if (!zip) return;
                    try {
                      const { files, skipped } = await filesFromZip(zip, limits);
                      await add(
                        files,
                        skipped.map((item) => `Skipped ${item}`),
                      );
                    } catch (error) {
                      setMenuOpen(false);
                      setVoiceError(
                        error instanceof ZipTooLargeError
                          ? error.message
                          : "That file isn't a zip Nexus can read.",
                      );
                    }
                  }}
                />
              </div>
            )}
          </div>
          {models.length > 1 && (
            <>
              <label htmlFor={ids.model} className="sr-only">
                AI model
              </label>
              <select
                id={ids.model}
                name="model"
                defaultValue="auto"
                className="max-w-36 truncate rounded-full border border-nx-border bg-nx-bg px-2 py-1 text-xs"
              >
                <option value="auto">Automatic</option>
                {models.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="flex-1 truncate text-xs text-nx-muted" aria-live="polite">
            {pending
              ? "The agent is replying…"
              : listening === "dictating" || listening === "recording"
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
            disabled={pending || uploading || text.trim().length === 0}
            className="rounded-full bg-nx-teal px-4 py-1.5 text-sm font-semibold text-nx-bg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
      {state.status === "error" && <FormMessage state={state} />}
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
      <UploadProgress status={uploader.status} />
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
