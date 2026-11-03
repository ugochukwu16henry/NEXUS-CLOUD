"use client";

import { attachmentName, normalizePath } from "@nexus/workspace";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishUpload, prepareUpload } from "@/app/(cockpit)/projects/[projectId]/uploads/actions";
import { announce } from "@/components/ui/announcer";
import { IDLE_STATE } from "@/lib/action-state";

export type PickedFile = { file: File; path: string };
export type UploadStatus =
  | { phase: "idle" }
  | { phase: "preparing"; total: number }
  | { phase: "uploading"; done: number; total: number }
  | { phase: "checking"; total: number }
  | { phase: "done" | "error"; message: string; notes: string[] };

const parseList = (value: string | undefined): { path: string; reason: string }[] =>
  value ? (JSON.parse(value) as { path: string; reason: string }[]) : [];

/**
 * Drives an upload end to end: ask the server which files may go (prepare), send them straight
 * to storage four at a time, then have the server check what arrived (finish). Progress is shown
 * in the panel and the result is announced for screen readers.
 */
export function useUploader(projectId: string, taskId: string, target: "worktree" | "attachment") {
  const router = useRouter();
  const [status, setStatus] = useState<UploadStatus>({ phase: "idle" });

  /** `earlier` carries notes from before the upload (files a zip left out). */
  async function upload(picked: PickedFile[], earlier: string[] = []) {
    if (picked.length === 0) {
      if (earlier.length > 0) {
        setStatus({ phase: "error", message: "Nothing to upload.", notes: earlier });
      }
      return;
    }
    setStatus({ phase: "preparing", total: picked.length });

    // Same naming rules as the server, so each signed URL can be matched to its file.
    const keyOf = (item: PickedFile) => {
      if (target === "attachment") return attachmentName(item.path);
      const normalized = normalizePath(item.path);
      return normalized.ok ? normalized.path : item.path;
    };
    const byKey = new Map(picked.map((item) => [keyOf(item), item.file]));

    const form = new FormData();
    form.set("projectId", projectId);
    form.set("taskId", taskId);
    form.set("target", target);
    form.set(
      "manifest",
      JSON.stringify(picked.map((item) => ({ path: item.path, size: item.file.size }))),
    );
    const prepared = await prepareUpload(IDLE_STATE, form);
    const skipped = parseList(prepared.data?.skipped);
    const rejected = parseList(prepared.data?.rejected);
    const notes = [
      ...earlier,
      ...skipped.map((item) => `Skipped ${item.path} (${item.reason})`),
      ...rejected.map((item) => `Not uploaded: ${item.path} (${item.reason})`),
    ];
    if (prepared.status !== "success" || !prepared.data?.batchId) {
      setStatus({
        phase: "error",
        message: prepared.message ?? "The upload couldn't start.",
        notes,
      });
      return;
    }

    const uploads = JSON.parse(prepared.data.uploads ?? "[]") as { path: string; url: string }[];
    let done = 0;
    setStatus({ phase: "uploading", done, total: uploads.length });
    for (let i = 0; i < uploads.length; i += 4) {
      await Promise.all(
        uploads.slice(i, i + 4).map(async ({ path, url }) => {
          const file = byKey.get(path);
          if (!file) return;
          const response = await fetch(url, {
            method: "PUT",
            body: file,
            headers: { "content-type": "application/octet-stream", "x-upsert": "false" },
          }).catch(() => null);
          if (!response?.ok) notes.push(`Not uploaded: ${path} (network error)`);
          done += 1;
          setStatus({ phase: "uploading", done, total: uploads.length });
        }),
      );
    }

    setStatus({ phase: "checking", total: uploads.length });
    const finishForm = new FormData();
    finishForm.set("projectId", projectId);
    finishForm.set("batchId", prepared.data.batchId);
    const finished = await finishUpload(IDLE_STATE, finishForm);
    const problems = finished.data?.problems
      ? (JSON.parse(finished.data.problems) as string[])
      : [];
    const message = finished.message ?? "Upload finished.";
    setStatus({
      phase: finished.status === "error" ? "error" : "done",
      message,
      notes: [...notes, ...problems],
    });
    announce(message);
    router.refresh();
  }

  return { status, upload };
}

/** Reads every file inside dropped folders (browsers hand them over as directory entries). */
export async function filesFromDrop(items: DataTransferItemList): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      out.push({ file, path: prefix + entry.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most 100 entries per call; keep reading until it's empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  };
  const entries = [...items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  for (const entry of entries) await walk(entry, "");
  return out;
}
