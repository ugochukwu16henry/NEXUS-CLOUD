import type { Metadata } from "next";
import Link from "next/link";
import { ChatComposer } from "@/components/agent/chat-composer";
import { ScrollToLatest } from "@/components/agent/scroll-to-latest";
import { ActionForm } from "@/components/ui/action-form";
import { filePath, getChat } from "@/lib/agents/chat";
import { formatMicros } from "@/lib/models/queries";
import { listAvailableModels } from "@/lib/models/run";
import { getProject } from "@/lib/projects/queries";
import { getWorkspaceLimits } from "@/lib/workspace/server";
import { makeTaskFromMessage, sendAgentMessage } from "./actions";

export const metadata: Metadata = { title: "Agent · Nexus Cloud" };

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * The project's Agent chat (one conversation per project, kept for good). Everything said and
 * every file added here stays with this project; another project has its own conversation.
 */
export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, chat, limits] = await Promise.all([
    getProject(projectId),
    getChat(projectId),
    getWorkspaceLimits(projectId),
  ]);
  const models = listAvailableModels();

  return (
    <main id="main" className="mx-auto flex min-h-full max-w-3xl flex-col px-4 pt-4 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Agent</h1>
        <p className="text-sm text-nx-muted">
          Your conversation about {project.name}. It&apos;s saved here, and files you add stay with
          this project. To have the agent change the code, tap “Make it a task” on a message.
        </p>
      </div>

      <ol aria-label="Conversation" className="flex flex-1 flex-col gap-4 py-6">
        {chat.messages.length === 0 && (
          <li className="rounded-lg border border-dashed border-nx-border p-4 text-sm text-nx-muted">
            No messages yet. Say what you want to build, ask about the code, or add files with +.
          </li>
        )}
        {chat.messages.map((message) => {
          const mine = message.author === "owner";
          const files = message.artifact_ids
            .map((fileId) => chat.files.get(fileId))
            .filter((file): file is NonNullable<typeof file> => Boolean(file));
          const task = message.task_id ? chat.tasks.get(message.task_id) : null;
          return (
            <li
              key={message.id}
              aria-label={mine ? "You" : "Agent"}
              className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words sm:max-w-[80%] ${
                  mine ? "bg-nx-teal/15 text-nx-text" : "border border-nx-border bg-nx-surface"
                }`}
              >
                {message.content}
                {files.length > 0 && (
                  <ul
                    aria-label="Files"
                    className="mt-2 space-y-0.5 border-t border-nx-border pt-2 text-xs text-nx-muted"
                  >
                    {files.slice(0, 8).map((file) => (
                      <li key={file.id} className="truncate font-mono">
                        {filePath(file)}
                      </li>
                    ))}
                    {files.length > 8 && <li>and {files.length - 8} more</li>}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-nx-muted">
                <span>
                  {mine ? "You" : "Agent"} · {timeFormat.format(new Date(message.created_at))} UTC
                  {!mine && message.model ? ` · ${message.model}` : ""}
                  {!mine && message.cost_usd_micros > 0
                    ? ` · ${formatMicros(message.cost_usd_micros)}`
                    : ""}
                </span>
                {mine &&
                  (task ? (
                    <Link
                      href={`/projects/${projectId}/tasks/${message.task_id}`}
                      className="text-nx-blue underline"
                    >
                      NX-{task.ref}: {task.title}
                    </Link>
                  ) : (
                    <ActionForm
                      action={makeTaskFromMessage}
                      submitLabel="Make it a task"
                      buttonClassName="rounded border border-nx-border px-2 py-0.5 text-xs text-nx-text hover:border-nx-blue"
                      className="inline-flex items-center"
                      announceSuccess
                    >
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="messageId" value={message.id} />
                    </ActionForm>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
      <ScrollToLatest count={chat.messages.length} />

      <div className="sticky bottom-0 bg-gradient-to-t from-nx-bg via-nx-bg to-transparent pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ChatComposer
          action={sendAgentMessage}
          projectId={projectId}
          models={models}
          limits={{
            maxFileMb: limits.maxFileMb,
            maxUploadMb: limits.maxUploadMb,
            maxFiles: limits.maxFiles,
          }}
        />
      </div>
    </main>
  );
}
