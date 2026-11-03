"use server";

import { randomUUID } from "node:crypto";
import {
  attachmentName,
  decideLock,
  detectContent,
  planUpload,
  scanForSecrets,
  type PlannedFile,
} from "@nexus/workspace";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, type HandlerResult } from "@/lib/actions";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOpenChangeset,
  getWorkspaceLimits,
  openWorkspace,
  sha256Hex,
} from "@/lib/workspace/server";

/**
 * Uploads in two steps (ADR 0016, 0017). `prepareUpload` checks the list of names and sizes and
 * hands out one short-lived signed upload URL per accepted file, so files go straight to private
 * storage instead of through the 4.5 MB function limit. `finishUpload` then checks every stored
 * object itself (real size, type by content, secrets) before it joins a change set or becomes an
 * attachment. Only the objects the server prepared are ever looked at.
 */

const MB = 1024 * 1024;
const manifest = z
  .string()
  .max(900_000)
  .transform((value, ctx) => {
    try {
      const parsed = z
        .array(z.object({ path: z.string().max(1000), size: z.number().int().nonnegative() }))
        .max(5000)
        .parse(JSON.parse(value));
      return parsed;
    } catch {
      ctx.addIssue({ code: "custom", message: "The file list couldn't be read." });
      return z.NEVER;
    }
  });

const prepareInput = z.object({
  projectId: id,
  taskId: id,
  target: z.enum(["worktree", "attachment"]),
  manifest,
});

type BatchFile = { path: string; key: string; size: number };

async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return out;
}

export const prepareUpload = defineAction(
  { name: "upload.prepare", access: "project:write", parse: parseForm(prepareInput) },
  async ({ projectId, taskId, target, manifest: files }, { viewer }): Promise<HandlerResult> => {
    const audit = {
      projectId,
      targetType: "task",
      targetId: taskId,
      metadata: { target, requested: files.length },
    };
    const supabase = await createSupabaseServerClient();
    const { data: task } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!task) return { status: "error", message: "That task no longer exists.", audit };
    const limits = await getWorkspaceLimits(projectId);

    let accepted: PlannedFile[];
    let skipped: { path: string; reason: string }[] = [];
    let rejected: { path: string; reason: string }[] = [];
    let keyPrefix: string;
    if (target === "worktree") {
      const changeset = await getOpenChangeset(taskId);
      if (!changeset) return { status: "error", message: "Start editing the task first.", audit };
      const lock = decideLock(
        { lockedBy: changeset.locked_by, lockedUntil: changeset.locked_until },
        viewer!.userId,
        new Date(),
      );
      if (!lock.ok)
        return { status: "error", message: "Someone else is editing this task right now.", audit };
      const plan = planUpload(files, limits);
      if (!plan.ok) return { status: "error", message: plan.message, audit };
      ({ accepted, skipped, rejected } = plan);
      keyPrefix = changeset.id;
    } else {
      const max = limits.attachmentMaxMb * MB;
      accepted = [];
      for (const file of files.slice(0, 50)) {
        const name = attachmentName(file.path);
        if (file.size > max)
          rejected.push({ path: name, reason: `larger than ${limits.attachmentMaxMb} MB` });
        else if (file.size === 0) rejected.push({ path: name, reason: "empty file" });
        else accepted.push({ path: name, size: file.size });
      }
      if (files.length > 50)
        skipped = [{ path: `${files.length - 50} more`, reason: "50 attachments at a time" }];
      keyPrefix = projectId;
    }
    if (accepted.length === 0) {
      return {
        status: "error",
        message: "None of those files can be uploaded.",
        data: { skipped: JSON.stringify(skipped), rejected: JSON.stringify(rejected) },
        audit,
      };
    }

    const bucket = target === "worktree" ? "workspace" : "attachments";
    const admin = createSupabaseAdminClient();
    const batchFiles: BatchFile[] = accepted.map((file) => ({
      ...file,
      key: `${keyPrefix}/${randomUUID()}`,
    }));
    const signed = await inBatches(batchFiles, 20, async (file) => {
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(file.key);
      if (error || !data) throw new Error(`signed upload url: ${error?.message}`);
      return { path: file.path, url: data.signedUrl };
    });
    const { data: batch, error } = await admin
      .from("upload_batches")
      .insert({
        project_id: projectId,
        task_id: taskId,
        target,
        files: batchFiles,
        created_by: viewer!.userId,
      })
      .select("id")
      .single();
    if (error) return { status: "error", message: "Couldn't start the upload.", audit };

    return {
      status: "success",
      message: `Uploading ${accepted.length} file(s)…`,
      data: {
        batchId: batch.id,
        uploads: JSON.stringify(signed),
        skipped: JSON.stringify(skipped),
        rejected: JSON.stringify(rejected),
      },
      audit: {
        ...audit,
        metadata: {
          ...audit.metadata,
          accepted: accepted.length,
          skipped: skipped.length,
          rejected: rejected.length,
        },
      },
    };
  },
);

export const finishUpload = defineAction(
  {
    name: "upload.finish",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, batchId: id })),
  },
  async ({ projectId, batchId }, { viewer }): Promise<HandlerResult> => {
    const audit = { projectId, targetType: "upload", targetId: batchId };
    const admin = createSupabaseAdminClient();
    const { data: batch } = await admin
      .from("upload_batches")
      .select("id, project_id, task_id, target, files, created_by, expires_at, finished_at")
      .eq("id", batchId)
      .maybeSingle();
    if (
      !batch ||
      batch.project_id !== projectId ||
      batch.created_by !== viewer!.userId ||
      batch.finished_at ||
      Date.parse(batch.expires_at) < Date.now()
    ) {
      return { status: "error", message: "That upload has expired. Try again.", audit };
    }
    await admin
      .from("upload_batches")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", batchId);

    const files = batch.files as BatchFile[];
    const bucket = batch.target === "worktree" ? "workspace" : "attachments";
    const limits = await getWorkspaceLimits(projectId);
    const problems: string[] = [];
    let added = 0;
    let held = 0;

    // Worktree uploads are compared with the branch, to tell new files from changed ones.
    const changeset =
      batch.target === "worktree" && batch.task_id ? await getOpenChangeset(batch.task_id) : null;
    let existing = new Set<string>();
    if (batch.target === "worktree") {
      if (!changeset)
        return {
          status: "error",
          message: "Those changes were committed or discarded meanwhile.",
          audit,
        };
      const ws = await openWorkspace(projectId, "read");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const { treeSha } = await ws.github.getCommit(
        ws.token,
        ws.target.fullName,
        changeset.base_sha,
      );
      existing = new Set(
        (await ws.github.getTree(ws.token, ws.target.fullName, treeSha)).map((entry) => entry.path),
      );
    }

    await inBatches(files, 8, async (file) => {
      const { data, error } = await admin.storage.from(bucket).download(file.key);
      if (error || !data) {
        problems.push(`${file.path}: didn't arrive`);
        return;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      const remove = () => admin.storage.from(bucket).remove([file.key]);
      // The browser declared a size; the stored object is what counts.
      const max = (batch.target === "worktree" ? limits.maxFileMb : limits.attachmentMaxMb) * MB;
      if (bytes.byteLength > max || bytes.byteLength !== file.size) {
        problems.push(`${file.path}: size doesn't match what was declared`);
        await remove();
        return;
      }
      const content = detectContent(bytes.subarray(0, 8192));
      const text =
        content.kind === "text" && bytes.byteLength <= 2 * MB
          ? new TextDecoder().decode(bytes)
          : null;

      if (batch.target === "worktree") {
        const secret = scanForSecrets(file.path, text);
        const { error: rowError } = await admin.from("changeset_files").upsert({
          changeset_id: changeset!.id,
          path: file.path,
          change: existing.has(file.path) ? "modify" : "add",
          storage_key: file.key,
          size_bytes: bytes.byteLength,
          sha256: sha256Hex(bytes),
          is_binary: content.kind !== "text",
          held_reason: secret?.reason ?? null,
          updated_at: new Date().toISOString(),
        });
        if (rowError) problems.push(`${file.path}: couldn't be saved`);
        else if (secret) held += 1;
        else added += 1;
        return;
      }

      const kind =
        content.kind === "image"
          ? "image"
          : content.kind === "pdf"
            ? "pdf"
            : content.kind === "text"
              ? "text"
              : "other";
      if (!limits.attachmentKinds.includes(kind)) {
        problems.push(`${file.path}: ${content.type} files aren't allowed as attachments`);
        await remove();
        return;
      }
      if (text && scanForSecrets(file.path, text)) {
        problems.push(`${file.path}: looks like it contains a secret, so it wasn't attached`);
        await remove();
        return;
      }
      const { error: rowError } = await admin.from("artifacts").insert({
        project_id: projectId,
        task_id: batch.task_id,
        kind,
        filename: file.path,
        content_type: content.type,
        size_bytes: bytes.byteLength,
        sha256: sha256Hex(bytes),
        storage_key: file.key,
        uploaded_by: viewer!.userId,
      });
      if (rowError) problems.push(`${file.path}: couldn't be saved`);
      else added += 1;
    });

    revalidatePath(`/projects/${projectId}`, "layout");
    const parts = [`${added} file(s) added`];
    if (held > 0) parts.push(`${held} held back for you to check`);
    if (problems.length > 0) parts.push(`${problems.length} not added`);
    return {
      status: problems.length > 0 && added + held === 0 ? "error" : "success",
      message: `${parts.join(", ")}.`,
      data: { problems: JSON.stringify(problems.slice(0, 50)) },
      audit: {
        ...audit,
        metadata: { target: batch.target, added, held, problems: problems.length },
      },
    };
  },
);
