"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PROVIDERS = [
  "anthropic",
  "openai",
  "gemini",
  "xai",
  "deepseek",
  "groq",
  "openrouter",
] as const;

const usd = (label: string, max: number) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .min(0, { error: `${label} can't be negative.` })
    .max(max, { error: `${label} is too large.` })
    .transform((value) => Math.round(value * 100) / 100);

const input = z.object({
  projectId: id,
  monthlyBudget: usd("Project budget", 1_000_000),
  runBudget: usd("Run budget", 10_000),
  allowFallback: z.literal("on").optional(),
  allowed: z
    .union([z.enum(PROVIDERS), z.array(z.enum(PROVIDERS))])
    .optional()
    .transform((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
    .refine((value) => value.length > 0, { error: "Allow at least one provider." }),
});

export const updateProjectModelSettings = defineAction(
  { name: "budget.update_project", access: "project:write", parse: parseForm(input) },
  async (fields) => {
    const supabase = await createSupabaseServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", fields.projectId)
      .maybeSingle();
    if (!project) return { status: "error", message: "That project no longer exists." };

    const { error } = await createSupabaseAdminClient()
      .from("project_model_settings")
      .upsert({
        project_id: fields.projectId,
        monthly_budget_usd: fields.monthlyBudget,
        run_budget_usd: fields.runBudget,
        allow_fallback: fields.allowFallback === "on",
        allowed_providers: fields.allowed,
      });
    if (error) return { status: "error", message: "Couldn't save the model settings." };
    revalidatePath(`/projects/${fields.projectId}`, "layout");
    return {
      status: "success",
      message: "Model settings saved.",
      audit: {
        projectId: fields.projectId,
        targetType: "project",
        targetId: fields.projectId,
        metadata: {
          monthlyBudget: fields.monthlyBudget,
          allowFallback: fields.allowFallback === "on",
        },
      },
    };
  },
);
