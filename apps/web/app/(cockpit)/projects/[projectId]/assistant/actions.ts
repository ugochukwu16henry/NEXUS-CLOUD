"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TASK_KINDS, type ProviderId } from "@nexus/model-gateway";
import { defineAction } from "@/lib/actions";
import { listAvailableModels, runModelPrompt } from "@/lib/models/run";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const askInput = z.object({
  projectId: id,
  taskKind: z.enum(TASK_KINDS, { error: "Choose a task type." }),
  prompt: z.string().trim().min(1, "Write a prompt.").max(8000, "That prompt is too long."),
  allowExpensive: z.literal("on").optional(),
  // "auto", or "provider/model" from the AI model list (checked against the priced models).
  model: z.string().max(160).optional(),
});

export const askModel = defineAction(
  {
    name: "model.complete",
    access: "project:write",
    parse: parseForm(askInput),
  },
  async (input) => {
    const audit = { projectId: input.projectId, targetType: "project", targetId: input.projectId };
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
    const result = await runModelPrompt({
      projectId: input.projectId,
      taskKind: input.taskKind,
      prompt: input.prompt,
      allowExpensive: input.allowExpensive === "on",
      manual,
    });
    revalidatePath(`/projects/${input.projectId}/assistant`);
    revalidatePath("/settings/models");
    return {
      status: result.status,
      message: result.message,
      audit: {
        ...audit,
        metadata: result.metadata,
        result: result.status === "error" ? "error" : "success",
      },
    };
  },
);

export const liftProjectStop = defineAction(
  {
    name: "budget.extend_project",
    access: "project:write",
    parse: parseForm(z.object({ projectId: id })),
  },
  async (input, { require }) => {
    const denied = require("budget:extend", `/projects/${input.projectId}/assistant`);
    if (denied) return denied;
    const supabase = await createSupabaseServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project) return { status: "error", message: "That project no longer exists." };

    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await createSupabaseAdminClient()
      .from("project_model_settings")
      .update({ extended_until: until })
      .eq("project_id", input.projectId);
    if (error) return { status: "error", message: "Couldn't lift the stop." };
    revalidatePath(`/projects/${input.projectId}/assistant`);
    return {
      status: "success",
      message: "Project stop lifted for 24 hours.",
      audit: { projectId: input.projectId, targetType: "project", targetId: input.projectId },
    };
  },
);
