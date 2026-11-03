import type { TreeEntry } from "@nexus/integrations";
import { detectContent, diffText, type FileDiff } from "@nexus/workspace";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentPanel } from "@/components/code/agent-panel";
import { CodeEditor } from "@/components/code/code-editor";
import { DiffView } from "@/components/code/diff-view";
import { Explorer, type ExplorerFile } from "@/components/code/explorer";
import { TerminalPanel } from "@/components/code/terminal-panel";
import { UploadPanel } from "@/components/code/upload-panel";
import { ActionForm } from "@/components/ui/action-form";
import { buttonSecondary } from "@/components/ui/fields";
import { requireViewer } from "@/lib/auth/session";
import { gitHubFailureMessage } from "@/lib/github/app";
import { getProject, getProjectTasks } from "@/lib/projects/queries";
import {
  EDITABLE_LIMIT,
  getOpenChangeset,
  getTaskBranch,
  getWorkspaceLimits,
  listChangedFiles,
  openWorkspace,
  readStoredFile,
  type Workspace,
} from "@/lib/workspace/server";
import {
  commitChangeset,
  discardChanges,
  moveToLatest,
  openPullRequest,
  resolveHeldFile,
  revertLatest,
  startWork,
} from "./actions";
import { startTerminal } from "../agent-actions";

export const metadata: Metadata = { title: "Code · Nexus Cloud" };

type Search = { task?: string; path?: string; view?: string };
type Selected = {
  path: string;
  text: string | null;
  imageUrl: string | null;
  note: string | null;
  diff: FileDiff | null;
  change: "add" | "modify" | "delete" | null;
  editable: boolean;
};

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ projectId }, search, viewer] = await Promise.all([
    params,
    searchParams,
    requireViewer(),
  ]);
  const [project, { tasks }] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId),
  ]);
  const task = tasks.find((candidate) => candidate.id === search.task) ?? null;
  const base = `/projects/${project.id}/code${task ? `?task=${task.id}` : ""}`;

  let ws: Workspace | null = null;
  let problem: string | null = null;
  try {
    ws = await openWorkspace(project.id, "read");
  } catch (error) {
    problem = gitHubFailureMessage(error);
  }
  if (!ws) {
    return (
      <main id="main" className="max-w-3xl space-y-3 p-6">
        <h1 className="text-lg font-semibold">Code</h1>
        <p role={problem ? "alert" : undefined} className="text-sm text-nx-muted">
          {problem ?? (
            <>
              Import a repository on the{" "}
              <Link href={`/projects/${project.id}/repository`} className="text-nx-blue underline">
                Repository
              </Link>{" "}
              tab to browse and edit code here.
            </>
          )}
        </p>
      </main>
    );
  }

  const workspace = ws;
  const changeset = task ? await getOpenChangeset(task.id) : null;
  const branch = changeset?.branch ?? (task ? await getTaskBranch(task.id) : null);
  const [defaultHead, branchHead] = await Promise.all([
    workspace.github.getBranchHead(
      workspace.token,
      workspace.target.fullName,
      workspace.target.defaultBranch,
    ),
    branch
      ? workspace.github.getBranchHead(workspace.token, workspace.target.fullName, branch)
      : null,
  ]);
  const baseSha = changeset?.base_sha ?? branchHead ?? defaultHead;
  if (!baseSha) {
    return (
      <main id="main" className="p-6">
        <h1 className="text-lg font-semibold">Code</h1>
        <p className="text-sm text-nx-muted">This repository has no commits yet.</p>
      </main>
    );
  }

  const [tree, changes, limits] = await Promise.all([
    (async () => {
      const { treeSha } = await workspace.github.getCommit(
        workspace.token,
        workspace.target.fullName,
        baseSha,
      );
      return workspace.github.getTree(workspace.token, workspace.target.fullName, treeSha);
    })(),
    changeset ? listChangedFiles(changeset.id) : Promise.resolve([]),
    getWorkspaceLimits(project.id),
  ]);
  const byPath = new Map<string, TreeEntry>(tree.map((entry) => [entry.path, entry]));
  const changeByPath = new Map(changes.map((change) => [change.path, change]));
  const files: ExplorerFile[] = [
    ...tree.map((entry) => ({
      path: entry.path,
      change: changeByPath.get(entry.path)?.change ?? null,
      held: Boolean(changeByPath.get(entry.path)?.held_reason),
    })),
    ...changes
      .filter((change) => !byPath.has(change.path))
      .map((change) => ({
        path: change.path,
        change: change.change,
        held: Boolean(change.held_reason),
      })),
  ];

  const lockedByOther =
    changeset?.locked_by &&
    changeset.locked_by !== viewer.userId &&
    changeset.locked_until &&
    Date.parse(changeset.locked_until) > Date.now();

  // ------------------------------------------------------------ the selected file
  let selected: Selected | null = null;
  const path = search.path && files.some((file) => file.path === search.path) ? search.path : null;
  if (path) {
    const change = changeByPath.get(path) ?? null;
    const entry = byPath.get(path);
    const before = entry
      ? await workspace.github.getBlob(workspace.token, workspace.target.fullName, entry.sha)
      : null;
    const after = change
      ? change.storage_key
        ? await readStoredFile(change.storage_key)
        : null
      : before;
    const shown = after ?? before ?? new Uint8Array();
    const kind = detectContent(shown.subarray(0, 4096));
    const isText = kind.kind === "text";
    selected = {
      path,
      change: change?.change ?? null,
      text: isText ? decode(shown) : null,
      imageUrl:
        kind.kind === "image" && kind.inline && shown.byteLength <= 2 * 1024 * 1024
          ? `data:${kind.type};base64,${Buffer.from(shown).toString("base64")}`
          : null,
      note:
        change?.change === "delete"
          ? "This file will be deleted when you commit."
          : !isText
            ? `${kind.type === "image/svg+xml" ? "SVG image (never shown inline, it can contain scripts)" : kind.type}, ${Math.ceil(shown.byteLength / 1024)} KB`
            : shown.byteLength > EDITABLE_LIMIT
              ? "Larger than 1 MB, so it opens read-only."
              : null,
      diff:
        change && isText && change.change !== "delete"
          ? diffText(before ? decode(before) : "", decode(shown))
          : change?.change === "delete" && before && isText
            ? diffText(decode(before), "")
            : null,
      editable: isText && shown.byteLength <= EDITABLE_LIMIT && change?.change !== "delete",
    };
  }

  const held = changes.filter((change) => change.held_reason);
  const view = search.view === "diff" && selected?.diff ? "diff" : "edit";
  const fileHref = (p: string, v?: string) =>
    `${base}${base.includes("?") ? "&" : "?"}path=${encodeURIComponent(p)}${v ? `&view=${v}` : ""}`;
  const branchMoved = changeset && branchHead && branchHead !== changeset.base_sha;

  return (
    <main id="main" className="flex h-[calc(100vh-8.5rem)] min-h-[32rem] flex-col">
      <h1 className="sr-only">Code</h1>
      {/* ---------------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-nx-border px-4 py-2 text-sm">
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="code-task" className="text-nx-muted">
            Task
          </label>
          <select
            id="code-task"
            name="task"
            defaultValue={task?.id ?? ""}
            className="rounded border border-nx-border bg-nx-bg px-2 py-1"
          >
            <option value="">Browse {workspace.target.defaultBranch} (read-only)</option>
            {tasks.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                NX-{candidate.ref} {candidate.title}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonSecondary}>
            Open
          </button>
        </form>
        <span className="font-mono text-xs text-nx-muted">
          {branch ?? workspace.target.defaultBranch}
        </span>
        {task && !changeset && (
          <ActionForm
            action={startWork}
            announceSuccess
            submitLabel={branch ? "Edit this task" : "Start a branch for this task"}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="taskId" value={task.id} />
          </ActionForm>
        )}
        {lockedByOther && (
          <span role="status" className="text-nx-warn">
            Someone else is editing this task; read-only until they finish.
          </span>
        )}
      </div>

      {branchMoved && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-nx-warn/60 bg-nx-panel px-4 py-2 text-sm"
        >
          The task branch has new commits on GitHub since you started.
          <ActionForm
            action={moveToLatest}
            announceSuccess
            submitLabel="Move to latest"
            buttonClassName={buttonSecondary}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="changesetId" value={changeset.id} />
          </ActionForm>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr]">
        {/* ---------------------------------------------------------------- explorer */}
        <aside
          aria-label="Files"
          className="flex min-h-0 flex-col border-r border-nx-border bg-nx-surface"
        >
          {changeset && !lockedByOther && (
            <UploadPanel
              projectId={project.id}
              taskId={task!.id}
              limits={{
                maxFileMb: limits.maxFileMb,
                maxUploadMb: limits.maxUploadMb,
                maxFiles: limits.maxFiles,
              }}
            />
          )}
          <div className="min-h-0 flex-1">
            <Explorer files={files} linkBase={base} selected={selected?.path ?? null} />
          </div>
        </aside>

        {/* ---------------------------------------------------------------- editor / diff */}
        {/* The editor keeps a usable height; the agent and terminal panels scroll in below it. */}
        <section aria-label="Editor" className="flex min-h-0 flex-col overflow-y-auto">
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-nx-border px-3 py-1.5 text-sm">
                <span className="font-mono">{selected.path}</span>
                {selected.diff && (
                  <nav aria-label="File view" className="ml-auto flex gap-2 text-xs">
                    <Link
                      href={fileHref(selected.path)}
                      aria-current={view === "edit" ? "page" : undefined}
                      className={view === "edit" ? "text-nx-text" : "text-nx-blue underline"}
                    >
                      File
                    </Link>
                    <Link
                      href={fileHref(selected.path, "diff")}
                      aria-current={view === "diff" ? "page" : undefined}
                      className={view === "diff" ? "text-nx-text" : "text-nx-blue underline"}
                    >
                      Diff
                    </Link>
                  </nav>
                )}
              </div>
              <div className="min-h-[18rem] flex-1 overflow-auto">
                {view === "diff" && selected.diff ? (
                  <DiffView path={selected.path} diff={selected.diff} />
                ) : selected.text !== null &&
                  !selected.note?.startsWith("This file will be deleted") ? (
                  <CodeEditor
                    key={`${selected.path}-${changeset?.id ?? "none"}-${changeByPath.get(selected.path)?.updated_at ?? ""}`}
                    projectId={project.id}
                    changesetId={changeset?.id ?? null}
                    path={selected.path}
                    initial={selected.text}
                    readOnly={!changeset || Boolean(lockedByOther) || !selected.editable}
                    readOnlyReason={
                      !changeset
                        ? task
                          ? "start editing this task to change files"
                          : "choose a task to edit; main is never edited directly"
                        : lockedByOther
                          ? "someone else holds the edit lock"
                          : (selected.note ?? undefined)
                    }
                  />
                ) : (
                  <div className="space-y-3 p-4 text-sm">
                    {selected.note && <p className="text-nx-muted">{selected.note}</p>}
                    {selected.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- a data: URL of a repository file
                      <img
                        src={selected.imageUrl}
                        alt={`Preview of ${selected.path}`}
                        className="max-h-[60vh] max-w-full rounded border border-nx-border"
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-nx-muted">
              {task
                ? "Choose a file on the left, or upload files and folders."
                : "Choose a task to edit its branch, or browse the files on the left."}
            </p>
          )}

          {/* ---------------------------------------------------------------- changes and commit */}
          {changeset && (
            <section
              aria-labelledby="changes-heading"
              className="max-h-[40%] overflow-auto border-t border-nx-border bg-nx-surface px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start gap-6">
                <div className="min-w-64 flex-1 space-y-2">
                  <h2 id="changes-heading" className="font-semibold">
                    Changes <span className="text-nx-muted">({changes.length})</span>
                  </h2>
                  {changes.length === 0 ? (
                    <p className="text-nx-muted">No changes yet.</p>
                  ) : (
                    <ul aria-label="Changed files" className="space-y-0.5">
                      {changes.map((change) => (
                        <li key={change.path} className="flex flex-wrap items-center gap-2">
                          <span className="w-16 text-xs text-nx-muted">
                            {change.change === "add"
                              ? "added"
                              : change.change === "modify"
                                ? "changed"
                                : "deleted"}
                          </span>
                          <Link
                            href={fileHref(change.path, change.is_binary ? undefined : "diff")}
                            className="font-mono text-xs text-nx-blue hover:underline"
                          >
                            {change.path}
                          </Link>
                          {change.held_reason && (
                            <span className="flex items-center gap-2 text-xs text-nx-warn">
                              Held back: {change.held_reason}
                              {(["keep", "drop"] as const).map((decision) => (
                                <ActionForm
                                  key={decision}
                                  action={resolveHeldFile}
                                  announceSuccess
                                  submitLabel={decision === "keep" ? "Keep" : "Drop"}
                                  buttonClassName={buttonSecondary}
                                  className="inline-flex"
                                >
                                  <input type="hidden" name="projectId" value={project.id} />
                                  <input type="hidden" name="changesetId" value={changeset.id} />
                                  <input type="hidden" name="path" value={change.path} />
                                  <input type="hidden" name="decision" value={decision} />
                                </ActionForm>
                              ))}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="w-80 space-y-3">
                  <ActionForm
                    action={commitChangeset}
                    announceSuccess
                    submitLabel="Commit to task branch"
                    resetOnSuccess
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="changesetId" value={changeset.id} />
                    <label htmlFor="commit-message" className="block text-xs text-nx-muted">
                      Commit message (NX-{task!.ref} is added for you)
                    </label>
                    <input
                      id="commit-message"
                      name="message"
                      required
                      maxLength={500}
                      className="w-full rounded border border-nx-border bg-nx-bg px-2 py-1"
                    />
                    {held.length > 0 && (
                      <p className="text-xs text-nx-warn">
                        Decide on held-back files before committing.
                      </p>
                    )}
                  </ActionForm>
                  <details>
                    <summary className="cursor-pointer text-xs text-nx-muted">
                      Discard all changes
                    </summary>
                    <ActionForm
                      action={discardChanges}
                      announceSuccess
                      submitLabel="Discard changes"
                      buttonClassName={buttonSecondary}
                      className="mt-2 space-y-2"
                    >
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="changesetId" value={changeset.id} />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="confirm" value="yes" /> I want to throw away{" "}
                        {changes.length} change(s)
                      </label>
                    </ActionForm>
                  </details>
                </div>
              </div>
            </section>
          )}

          {task && branch && branchHead && (
            <div className="flex flex-wrap items-start gap-4 border-t border-nx-border px-4 py-2 text-sm">
              <ActionForm
                action={openPullRequest}
                submitLabel="Open pull request"
                buttonClassName={buttonSecondary}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="taskId" value={task.id} />
              </ActionForm>
              <details>
                <summary className="cursor-pointer text-xs text-nx-muted">
                  Revert the latest commit
                </summary>
                <ActionForm
                  action={revertLatest}
                  submitLabel="Revert latest commit"
                  buttonClassName={buttonSecondary}
                  className="mt-2 space-y-2"
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="head" value={branchHead} />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="confirm" value="yes" /> Undo commit{" "}
                    <span className="font-mono">{branchHead.slice(0, 7)}</span> with a new commit
                  </label>
                </ActionForm>
              </details>
            </div>
          )}
          {task && (
            <div className="border-t border-nx-border px-4 py-3">
              <AgentPanel projectId={project.id} taskId={task.id} />
            </div>
          )}
          {task && (
            <TerminalPanel
              action={startTerminal}
              projectId={project.id}
              taskId={task.id}
              workerUrl={process.env.WORKER_WS_URL ?? null}
            />
          )}
        </section>
      </div>
    </main>
  );
}
