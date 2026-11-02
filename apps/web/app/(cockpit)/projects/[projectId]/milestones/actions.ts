"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/actions";
import { dbErrorMessage, updateVersioned } from "@/lib/projects/db";
import { parseForm } from "@/lib/projects/parse";
import { id, milestoneFields, version } from "@/lib/projects/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createInput = milestoneFields.extend({ projectId: id });
const updateInput = milestoneFields.extend({ projectId: id, milestoneId: id, version });

export const createMilestone = defineAction(
  { name: "milestone.create", access: "project:write", parse: parseForm(createInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("milestones")
      .insert({
        project_id: input.projectId,
        title: input.title,
        criteria: input.criteria,
        target_date: input.targetDate,
        status: input.status,
        client_visible: input.clientVisible,
      })
      .select("id")
      .single();
    if (error)
      return {
        status: "error",
        message: dbErrorMessage(error),
        audit: { projectId: input.projectId },
      };

    revalidatePath(`/projects/${input.projectId}`, "layout");
    return {
      status: "success",
      message: "Milestone added.",
      audit: { projectId: input.projectId, targetType: "milestone", targetId: data.id },
    };
  },
);

export const updateMilestone = defineAction(
  { name: "milestone.update", access: "project:write", parse: parseForm(updateInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(supabase, "milestones", input.milestoneId, input.version, {
      title: input.title,
      criteria: input.criteria,
      target_date: input.targetDate,
      status: input.status,
      client_visible: input.clientVisible,
    });
    const audit = {
      projectId: input.projectId,
      targetType: "milestone",
      targetId: input.milestoneId,
    };
    if (!result.ok) return { status: "error", message: result.message, audit };

    revalidatePath(`/projects/${input.projectId}`, "layout");
    return {
      status: "success",
      message: "Milestone saved.",
      data: { version: String(result.version) },
      audit,
    };
  },
);
