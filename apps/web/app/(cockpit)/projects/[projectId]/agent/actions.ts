"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@nexus/db";
import type { ProviderId } from "@nexus/model-gateway";
import { defineAction } from "@/lib/actions";
import { buildChatContext } from "@/lib/agents/chat";
import { queuePlan } from "@/lib/agents/runs";
import { listAvailableModels, runModelMessages } from "@/lib/models/run";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Provider = Database["public"]["Enums"]["model_provider"];

const fileIds = z
  .string()
  .default("[]")
  .transform((value, context) => {
    try {
      return z.array(z.uuid()).max(500).parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "Bad file list." });
      return z.NEVER;
    }
  });

const sendInput = z.object({
  projectId: id,
  content: z
    .string()
    .trim()
    .min(1, "Write or say something first.")
    .max(8000, "That message is too long."),
  fileIds,
  // "auto", or "provider/model" from the AI model list.
  model: z.string().max(160).optional(),
});

function chatPath(projectId: string) {
  return `/projects/${projectId}/agent`;
}

/**
 * The owner's message goes into the project's conversation, then the agent replies with the recent
 * history and the new files in view. The reply goes through the project's gateway: routes, allowed
 * providers, fallback, budgets and the ledger (Sprint 5).
 */
export const sendAgentMessage = defineAction(
  { name: "agent.chat", access: "project:write", parse: parseForm(sendInput) },
  async (input) => {
    const audit = { projectId: input.projectId, targetType: "project", targetId: input.projectId };
    const supabase = await createSupabaseServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, stack")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project) return { status: "error", message: "That project no longer exists.", audit };

    let manual: { provider: ProviderId; model: string } | null = null;
    if (input.model && input.model !== "auto") {
      if (!listAvailableModels().some((option) => option.value === input.model)) {
        return {
          status: "error",
          message: "That model isn't available. Choose one from the list.",
          audit,
        };
      }
      const [provider, ...rest] = input.model.split("/");
      manual = { provider: provider as ProviderId, model: rest.join("/") };
    }

    const admin = createSupabaseAdminClient();
    if (input.fileIds.length > 0) {
      const { count } = await admin
        .from("artifacts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .in("id", input.fileIds);
      if (count !== input.fileIds.length) {
        return { status: "error", message: "Some of those files aren't in this project.", audit };
      }
    }
    const { error: saveError } = await admin.from("agent_messages").insert({
      project_id: project.id,
      author: "owner",
      content: input.content,
      artifact_ids: input.fileIds,
    });
    if (saveError) return { status: "error", message: "Couldn't save your message.", audit };

    const messages = await buildChatContext({
      projectId: project.id,
      project,
      newFileIds: input.fileIds,
    });
    const result = await runModelMessages({
      projectId: project.id,
      taskKind: "routine",
      messages,
      maxOutputTokens: 2000,
      // The owner chose to send it; the per-project budget and the monthly cap still apply.
      allowExpensive: true,
      manual,
    });
    if (result.status === "success" && result.reply) {
      const notes = result.notes?.length ? `\n\n${result.notes.join(" ")}` : "";
      await admin.from("agent_messages").insert({
        project_id: project.id,
        author: "agent",
        content: `${result.reply}${notes}`.slice(0, 20_000),
        provider: (result.metadata?.provider ?? null) as Provider | null,
        model: (result.metadata?.model as string | undefined) ?? null,
        cost_usd_micros: Number(result.metadata?.costUsdMicros ?? 0),
      });
    }
    revalidatePath(chatPath(project.id));
    revalidatePath("/agents");
    return {
      status: result.status,
      message:
        result.status === "success"
          ? "Sent."
          : `Your message is saved, but the agent couldn't reply: ${result.message}`,
      audit: {
        ...audit,
        metadata: { files: input.fileIds.length, ...result.metadata },
        result: result.status === "error" ? "error" : "success",
      },
    };
  },
);

/** Turns one of the owner's messages into a task and queues its plan (the coding agent's start). */
export const makeTaskFromMessage = defineAction(
  {
    name: "agent.chat_task",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id, messageId: id })),
  },
  async (input) => {
    const audit = {
      projectId: input.projectId,
      targetType: "agent_message",
      targetId: input.messageId,
    };
    const admin = createSupabaseAdminClient();
    const { data: message } = await admin
      .from("agent_messages")
      .select("id, project_id, author, content, task_id")
      .eq("id", input.messageId)
      .maybeSingle();
    if (!message || message.project_id !== input.projectId || message.author !== "owner") {
      return { status: "error", message: "That message isn't in this project.", audit };
    }
    if (message.task_id) {
      return { status: "success", message: "That message is already a task.", audit };
    }
    const firstLine = message.content.split("\n").find((line) => line.trim()) ?? message.content;
    const title = firstLine.trim().slice(0, 120) || "Task from the Agent chat";
    // RLS checks the owner again on the insert.
    const supabase = await createSupabaseServerClient();
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: input.projectId,
        title,
        description: message.content.slice(0, 10_000),
        state: "ready",
        assignee_type: "agent",
      })
      .select("id, ref")
      .single();
    if (error || !task) return { status: "error", message: "Couldn't create the task.", audit };
    await admin.from("agent_messages").update({ task_id: task.id }).eq("id", message.id);
    const queued = await queuePlan({
      projectId: input.projectId,
      taskId: task.id,
      purpose: message.content.slice(0, 4000),
      idempotencyKey: `chat-${message.id}`,
    });
    revalidatePath(chatPath(input.projectId));
    return {
      status: "success",
      message: queued.ok
        ? `NX-${task.ref} created and its plan is queued. Open it to approve the plan.`
        : `NX-${task.ref} created. ${queued.message}`,
      audit: { ...audit, metadata: { taskId: task.id, ref: task.ref, planned: queued.ok } },
    };
  },
);
