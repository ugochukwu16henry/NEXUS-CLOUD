import { buildSnapshot, readTar, type OverlayFile } from "@nexus/agents";
import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { gitHubFailureMessage } from "@/lib/github/app";
import { getViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOpenChangeset,
  listChangedFiles,
  openWorkspace,
  readStoredFile,
} from "@/lib/workspace/server";

/**
 * The task's files as one .zip: the repository at the change set's base commit with the task's
 * changes on top, or the default branch when no task is chosen. This is how files get back to a
 * laptop or a phone, and what "Open a folder" compares against. Owner only; RLS decides what the
 * project and change set queries can see, and the download is audited.
 */

const uuid = z.uuid();

function plain(status: number, message: string) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain" } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const taskId = new URL(request.url).searchParams.get("task");
  if (!uuid.safeParse(projectId).success || (taskId && !uuid.safeParse(taskId).success)) {
    return plain(400, "Bad request.");
  }
  const viewer = await getViewer();
  if (!viewer) return plain(401, "Sign in first.");
  if (viewer.role !== "owner") return plain(403, "Only the owner can download code.");

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return plain(404, "That project no longer exists.");

  try {
    const ws = await openWorkspace(projectId, "read");
    if (!ws) return plain(404, "Import a repository first.");
    const changeset = taskId ? await getOpenChangeset(taskId) : null;
    if (changeset && changeset.project_id !== projectId) return plain(404, "Not found.");
    const ref = changeset?.base_sha ?? ws.target.defaultBranch;

    const [archive, changes] = await Promise.all([
      ws.github.getTarball(ws.token, ws.target.fullName, ref),
      changeset ? listChangedFiles(changeset.id) : Promise.resolve([]),
    ]);
    const overlay: OverlayFile[] = await Promise.all(
      changes.map(async (row): Promise<OverlayFile> =>
        row.change === "delete" || !row.storage_key
          ? { path: row.path, change: "delete" }
          : { path: row.path, change: row.change, bytes: await readStoredFile(row.storage_key) },
      ),
    );
    const snapshot = buildSnapshot({
      repoFiles: readTar(archive, { strip: 1 }),
      overlay,
      // A download is the whole repository: nothing is skipped.
      skipFolders: [],
      maxFileBytes: Number.POSITIVE_INFINITY,
    });
    const zip = zipSync(Object.fromEntries(snapshot.files.map((file) => [file.path, file.bytes])), {
      level: 6,
    });

    const repoName = ws.target.fullName.split("/").at(-1) ?? "repository";
    const label = (changeset?.branch ?? ref).replace(/[^A-Za-z0-9._-]/g, "-");
    await recordAudit({
      workspaceId: project.workspace_id,
      projectId,
      actorId: viewer.userId,
      actorType: "user",
      action: "code.export",
      targetType: changeset ? "changeset" : "repository",
      targetId: changeset?.id ?? ws.repo.id,
      result: "success",
      metadata: { files: snapshot.files.length, changed: changes.length, bytes: zip.byteLength },
    });
    return new NextResponse(zip.slice().buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${repoName}-${label}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return plain(502, gitHubFailureMessage(error));
  }
}
