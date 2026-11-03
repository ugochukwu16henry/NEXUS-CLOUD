"use server";

import {
  BranchMovedError,
  BranchNotWritableError,
  commitChanges,
  ensureTaskBranch,
  GitHubError,
  revertLatestCommit,
} from "@nexus/integrations";
import {
  commitMessage,
  decideLock,
  normalizePath,
  scanForSecrets,
  taskBranchName,
} from "@nexus/workspace";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, type HandlerResult } from "@/lib/actions";
import { gitHubFailureMessage } from "@/lib/github/app";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BUCKET,
  EDITABLE_LIMIT,
  getOpenChangeset,
  getTaskBranch,
  listChangedFiles,
  openWorkspace,
  readCommittedFile,
  readStoredFile,
  sha256Hex,
  storeFile,
} from "@/lib/workspace/server";

const codePath = (projectId: string) => `/projects/${projectId}/code`;
const confirmed = z.literal("yes", { error: "Tick the box to confirm." });

/** Maps the errors writing to GitHub can raise to messages the owner can act on. */
function writeFailure(error: unknown, audit: HandlerResult["audit"]): HandlerResult {
  if (error instanceof BranchMovedError) {
    return {
      status: "error",
      message:
        "The task branch changed on GitHub since you started. Your edits are kept: use “Move to latest” to put them on top of the new commits, then commit again.",
      audit: { ...audit, metadata: { reason: "branch_moved" } },
    };
  }
  if (error instanceof BranchNotWritableError) {
    return { status: "error", message: error.message, audit: { ...audit, result: "denied" } };
  }
  if (error instanceof GitHubError) {
    return {
      status: "error",
      message: gitHubFailureMessage(error),
      audit: { ...audit, metadata: { status: error.status } },
    };
  }
  throw error;
}

/** Loads a task the signed-in owner can see (RLS), or null. */
async function getTaskForCode(projectId: string, taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, ref, title, project_id")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

/** The open change set, checked against the edit lock for this user (and extended when held). */
async function lockedChangeset(changesetId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: changeset } = await supabase
    .from("changesets")
    .select("id, project_id, task_id, branch, base_sha, status, locked_by, locked_until")
    .eq("id", changesetId)
    .maybeSingle();
  if (!changeset || changeset.status !== "open")
    return { error: "Those changes were already committed or discarded." } as const;
  const lock = decideLock(
    { lockedBy: changeset.locked_by, lockedUntil: changeset.locked_until },
    userId,
    new Date(),
  );
  if (!lock.ok) {
    return {
      error:
        "Someone else is editing this task right now; the editor is read-only until they finish.",
    } as const;
  }
  await createSupabaseAdminClient()
    .from("changesets")
    .update({ locked_by: userId, locked_until: lock.lockedUntil })
    .eq("id", changeset.id);
  return { changeset } as const;
}

// ------------------------------------------------------------ start work

export const startWork = defineAction(
  {
    name: "workspace.start",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, taskId: id })),
  },
  async ({ projectId, taskId }, { viewer }) => {
    const audit = { projectId, targetType: "task", targetId: taskId };
    const task = await getTaskForCode(projectId, taskId);
    if (!task) return { status: "error", message: "That task no longer exists.", audit };
    if (await getOpenChangeset(taskId)) return { status: "success", message: "Ready.", audit };

    try {
      const ws = await openWorkspace(projectId, "write");
      if (!ws)
        return { status: "error", message: "Import a repository for this project first.", audit };
      const branch = (await getTaskBranch(taskId)) ?? taskBranchName(task.ref, task.title);
      const head = await ensureTaskBranch(ws.github, ws.token, ws.target, branch);
      const lock = decideLock({ lockedBy: null, lockedUntil: null }, viewer!.userId, new Date());
      const { error } = await createSupabaseAdminClient()
        .from("changesets")
        .insert({
          project_id: projectId,
          repository_id: ws.repo.id,
          task_id: taskId,
          branch,
          base_sha: head,
          locked_by: viewer!.userId,
          locked_until: lock.ok ? lock.lockedUntil : null,
        });
      if (error) return { status: "error", message: "Couldn't start the change set.", audit };
      revalidatePath(codePath(projectId));
      return {
        status: "success",
        message: `Working on ${branch}.`,
        audit: { ...audit, metadata: { branch } },
      };
    } catch (error) {
      return writeFailure(error, audit);
    }
  },
);

// ------------------------------------------------------------ edit

const saveInput = z.object({
  projectId: id,
  changesetId: id,
  path: z.string().min(1).max(300),
  content: z.string().max(EDITABLE_LIMIT, { error: "Files over 1 MB open read-only." }),
});

export const saveFile = defineAction(
  { name: "workspace.save", access: "project:write", parse: parseForm(saveInput) },
  async ({ projectId, changesetId, path: rawPath, content }, { viewer }) => {
    const audit = { projectId, targetType: "changeset", targetId: changesetId };
    const normalized = normalizePath(rawPath);
    if (!normalized.ok)
      return {
        status: "error",
        message: `That file name isn't allowed: ${normalized.reason}.`,
        audit,
      };
    const path = normalized.path;

    const locked = await lockedChangeset(changesetId, viewer!.userId);
    if ("error" in locked) return { status: "error", message: locked.error, audit };
    const { changeset } = locked;

    try {
      const ws = await openWorkspace(projectId, "read");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const bytes = new TextEncoder().encode(content);
      const committed = await readCommittedFile(ws, changeset.base_sha, path);
      const admin = createSupabaseAdminClient();

      if (committed && Buffer.from(committed).equals(Buffer.from(bytes))) {
        // Back to what's committed: no longer a change.
        await admin
          .from("changeset_files")
          .delete()
          .eq("changeset_id", changeset.id)
          .eq("path", path);
      } else {
        const key = await storeFile(changeset.id, bytes);
        const held = scanForSecrets(path, content);
        const { error } = await admin.from("changeset_files").upsert({
          changeset_id: changeset.id,
          path,
          change: committed ? "modify" : "add",
          storage_key: key,
          size_bytes: bytes.byteLength,
          sha256: sha256Hex(bytes),
          is_binary: false,
          held_reason: held?.reason ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) return { status: "error", message: "Couldn't save the file.", audit };
        if (held) {
          revalidatePath(codePath(projectId));
          return {
            status: "success",
            message: `Saved, but held back from commits: ${held.reason}. Keep or drop it under Changes.`,
            audit: { ...audit, metadata: { path, held: true } },
          };
        }
      }
      revalidatePath(codePath(projectId));
      return { status: "success", message: "Saved.", audit: { ...audit, metadata: { path } } };
    } catch (error) {
      return writeFailure(error, audit);
    }
  },
);

export const deleteFile = defineAction(
  {
    name: "workspace.delete_file",
    access: "project:write",
    parse: parseForm(
      z.object({ projectId: id, changesetId: id, path: z.string().min(1).max(300) }),
    ),
  },
  async ({ projectId, changesetId, path: rawPath }, { viewer }) => {
    const audit = { projectId, targetType: "changeset", targetId: changesetId };
    const normalized = normalizePath(rawPath);
    if (!normalized.ok) return { status: "error", message: "That file name isn't allowed.", audit };
    const locked = await lockedChangeset(changesetId, viewer!.userId);
    if ("error" in locked) return { status: "error", message: locked.error, audit };

    const ws = await openWorkspace(projectId, "read");
    if (!ws) return { status: "error", message: "The repository isn't available.", audit };
    const committed = await readCommittedFile(ws, locked.changeset.base_sha, normalized.path);
    const admin = createSupabaseAdminClient();
    if (committed) {
      await admin.from("changeset_files").upsert({
        changeset_id: changesetId,
        path: normalized.path,
        change: "delete",
        storage_key: null,
        size_bytes: 0,
        held_reason: null,
        updated_at: new Date().toISOString(),
      });
    } else {
      await admin
        .from("changeset_files")
        .delete()
        .eq("changeset_id", changesetId)
        .eq("path", normalized.path);
    }
    revalidatePath(codePath(projectId));
    return {
      status: "success",
      message: `${normalized.path} will be deleted.`,
      audit: { ...audit, metadata: { path: normalized.path } },
    };
  },
);

export const resolveHeldFile = defineAction(
  {
    name: "workspace.held_file",
    access: "project:write",
    parse: parseForm(
      z.object({
        projectId: id,
        changesetId: id,
        path: z.string().min(1).max(300),
        decision: z.enum(["keep", "drop"]),
      }),
    ),
  },
  async ({ projectId, changesetId, path, decision }) => {
    const audit = {
      projectId,
      targetType: "changeset",
      targetId: changesetId,
      metadata: { path, decision },
    };
    const admin = createSupabaseAdminClient();
    const changes = await listChangedFiles(changesetId);
    const file = changes.find((item) => item.path === path && item.held_reason);
    if (!file) return { status: "error", message: "That file isn't held back.", audit };
    if (decision === "keep") {
      await admin
        .from("changeset_files")
        .update({ held_reason: null })
        .eq("changeset_id", changesetId)
        .eq("path", path);
    } else {
      await admin.from("changeset_files").delete().eq("changeset_id", changesetId).eq("path", path);
      if (file.storage_key) await admin.storage.from(BUCKET).remove([file.storage_key]);
    }
    revalidatePath(codePath(projectId));
    return {
      status: "success",
      message: decision === "keep" ? `${path} will be committed.` : `${path} was dropped.`,
      audit,
    };
  },
);

// ------------------------------------------------------------ commit, PR, revert, discard

export const commitChangeset = defineAction(
  {
    name: "workspace.commit",
    access: "project:write",
    parse: parseForm(
      z.object({
        projectId: id,
        changesetId: id,
        message: z.string().trim().min(1, { error: "Describe the change." }).max(500),
      }),
    ),
  },
  async ({ projectId, changesetId, message }, { viewer }) => {
    const audit = { projectId, targetType: "changeset", targetId: changesetId };
    const locked = await lockedChangeset(changesetId, viewer!.userId);
    if ("error" in locked) return { status: "error", message: locked.error, audit };
    const { changeset } = locked;
    const files = await listChangedFiles(changeset.id);
    if (files.length === 0)
      return { status: "error", message: "There's nothing to commit.", audit };
    const held = files.filter((file) => file.held_reason);
    if (held.length > 0) {
      return {
        status: "error",
        message: `Decide on ${held.length} held-back file(s) first.`,
        audit,
      };
    }
    const task = await getTaskForCode(projectId, changeset.task_id);
    if (!task) return { status: "error", message: "That task no longer exists.", audit };

    try {
      const ws = await openWorkspace(projectId, "write");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const contents = await Promise.all(
        files.map(async (file) => ({
          path: file.path,
          change: file.change,
          content: file.storage_key ? await readStoredFile(file.storage_key) : undefined,
        })),
      );
      const counts = { add: 0, modify: 0, delete: 0 };
      for (const file of files) counts[file.change] += 1;
      const sha = await commitChanges(ws.github, ws.token, ws.target, {
        branch: changeset.branch,
        baseSha: changeset.base_sha,
        message: commitMessage(
          task.ref,
          message,
          `${counts.add} added, ${counts.modify} changed, ${counts.delete} deleted. Committed from Nexus Cloud.`,
        ),
        files: contents,
      });
      const admin = createSupabaseAdminClient();
      await admin
        .from("changesets")
        .update({ status: "committed", committed_sha: sha, locked_by: null, locked_until: null })
        .eq("id", changeset.id);
      const keys = files.flatMap((file) => (file.storage_key ? [file.storage_key] : []));
      if (keys.length > 0) await admin.storage.from(BUCKET).remove(keys);
      revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "success",
        message: `Committed ${files.length} file(s) to ${changeset.branch}.`,
        data: { sha },
        audit: { ...audit, metadata: { sha, branch: changeset.branch, ...counts } },
      };
    } catch (error) {
      return writeFailure(error, audit);
    }
  },
);

/** After someone else pushed to the task branch: keep the edits, base them on the new head. */
export const moveToLatest = defineAction(
  {
    name: "workspace.rebase",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, changesetId: id })),
  },
  async ({ projectId, changesetId }, { viewer }) => {
    const audit = { projectId, targetType: "changeset", targetId: changesetId };
    const locked = await lockedChangeset(changesetId, viewer!.userId);
    if ("error" in locked) return { status: "error", message: locked.error, audit };
    try {
      const ws = await openWorkspace(projectId, "read");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const head = await ws.github.getBranchHead(
        ws.token,
        ws.target.fullName,
        locked.changeset.branch,
      );
      if (!head)
        return { status: "error", message: "The task branch no longer exists on GitHub.", audit };
      await createSupabaseAdminClient()
        .from("changesets")
        .update({ base_sha: head })
        .eq("id", changesetId);
      revalidatePath(codePath(projectId));
      return {
        status: "success",
        message: "Your edits now sit on the latest commit. Check the diff, then commit.",
        audit: { ...audit, metadata: { head } },
      };
    } catch (error) {
      return writeFailure(error, audit);
    }
  },
);

export const openPullRequest = defineAction(
  {
    name: "workspace.open_pr",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, taskId: id })),
  },
  async ({ projectId, taskId }) => {
    const audit = { projectId, targetType: "task", targetId: taskId };
    const task = await getTaskForCode(projectId, taskId);
    const branch = await getTaskBranch(taskId);
    if (!task || !branch)
      return { status: "error", message: "Commit something on this task first.", audit };
    try {
      const ws = await openWorkspace(projectId, "write");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const pr = await ws.github.createPullRequest(ws.token, ws.target.fullName, {
        head: branch,
        base: ws.target.defaultBranch,
        title: `NX-${task.ref}: ${task.title}`,
        body: `Task NX-${task.ref} in Nexus Cloud.\n\nOpened from the Code tab; review the diff and checks here or in Nexus.`,
      });
      return {
        status: "success",
        message: `Pull request #${pr.number} opened.`,
        data: { url: pr.htmlUrl },
        audit: { ...audit, metadata: { number: pr.number, branch } },
      };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 422) {
        return {
          status: "error",
          message: "A pull request for this branch already exists, or it has no new commits.",
          audit,
        };
      }
      return writeFailure(error, audit);
    }
  },
);

export const revertLatest = defineAction(
  {
    name: "workspace.revert",
    access: "project:write",
    parse: parseForm(
      z.object({
        projectId: id,
        taskId: id,
        head: z.string().regex(/^[0-9a-f]{40}$/),
        confirm: confirmed,
      }),
    ),
  },
  async ({ projectId, taskId, head }) => {
    const audit = { projectId, targetType: "task", targetId: taskId };
    if (
      await getOpenChangeset(taskId)
        .then((open) => open && listChangedFiles(open.id))
        .then((files) => files && files.length > 0)
    ) {
      return {
        status: "error",
        message: "Commit or discard your open changes before reverting.",
        audit,
      };
    }
    const branch = await getTaskBranch(taskId);
    if (!branch) return { status: "error", message: "This task has no branch yet.", audit };
    try {
      const ws = await openWorkspace(projectId, "write");
      if (!ws) return { status: "error", message: "The repository isn't available.", audit };
      const sha = await revertLatestCommit(ws.github, ws.token, ws.target, {
        branch,
        expectedHead: head,
      });
      // An empty open change set would now sit on an old base; move it along.
      await createSupabaseAdminClient()
        .from("changesets")
        .update({ base_sha: sha })
        .eq("task_id", taskId)
        .eq("status", "open");
      revalidatePath(`/projects/${projectId}`, "layout");
      return {
        status: "success",
        message: "Reverted the latest commit.",
        audit: { ...audit, metadata: { sha, reverted: head } },
      };
    } catch (error) {
      if (error instanceof Error && /no commits of its own|Merge commits/.test(error.message)) {
        return { status: "error", message: error.message, audit };
      }
      return writeFailure(error, audit);
    }
  },
);

export const discardChanges = defineAction(
  {
    name: "workspace.discard",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, changesetId: id, confirm: confirmed })),
  },
  async ({ projectId, changesetId }, { viewer }) => {
    const audit = { projectId, targetType: "changeset", targetId: changesetId };
    const locked = await lockedChangeset(changesetId, viewer!.userId);
    if ("error" in locked) return { status: "error", message: locked.error, audit };
    const files = await listChangedFiles(changesetId);
    const admin = createSupabaseAdminClient();
    await admin
      .from("changesets")
      .update({ status: "discarded", locked_by: null, locked_until: null })
      .eq("id", changesetId);
    const keys = files.flatMap((file) => (file.storage_key ? [file.storage_key] : []));
    if (keys.length > 0) await admin.storage.from(BUCKET).remove(keys);
    revalidatePath(codePath(projectId));
    return {
      status: "success",
      message: `Discarded ${files.length} change(s).`,
      audit: { ...audit, metadata: { files: files.length } },
    };
  },
);
