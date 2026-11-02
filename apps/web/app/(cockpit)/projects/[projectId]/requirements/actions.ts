"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { dbErrorMessage, updateVersioned } from "@/lib/projects/db";
import { parseForm } from "@/lib/projects/parse";
import { id, requirementFields, version } from "@/lib/projects/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createInput = requirementFields.extend({ projectId: id });
const updateInput = requirementFields.extend({ projectId: id, requirementId: id, version });
const approvalInput = z.object({
  projectId: id,
  requirementId: id,
  version,
  approval: z.enum(["draft", "approved", "rejected"]),
});

export const createRequirement = defineAction(
  { name: "requirement.create", access: "project:write", parse: parseForm(createInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("requirements")
      .insert({
        project_id: input.projectId,
        title: input.title,
        statement: input.statement,
        acceptance_criteria: input.acceptanceCriteria,
        priority: input.priority,
        source: input.source,
      })
      .select("id, ref")
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
      message: `REQ-${data.ref} added.`,
      audit: { projectId: input.projectId, targetType: "requirement", targetId: data.id },
    };
  },
);

/** Editing keeps the previous version in history; editing approved content returns it to draft. */
export const updateRequirement = defineAction(
  { name: "requirement.update", access: "project:write", parse: parseForm(updateInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(
      supabase,
      "requirements",
      input.requirementId,
      input.version,
      {
        title: input.title,
        statement: input.statement,
        acceptance_criteria: input.acceptanceCriteria,
        priority: input.priority,
        source: input.source,
      },
    );
    const audit = {
      projectId: input.projectId,
      targetType: "requirement",
      targetId: input.requirementId,
    };
    if (!result.ok) return { status: "error", message: result.message, audit };

    revalidatePath(`/projects/${input.projectId}`, "layout");
    return {
      status: "success",
      message: `Saved as version ${result.version}.`,
      data: { version: String(result.version) },
      audit,
    };
  },
);

export const setRequirementApproval = defineAction(
  { name: "requirement.approval", access: "requirement:approve", parse: parseForm(approvalInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(
      supabase,
      "requirements",
      input.requirementId,
      input.version,
      {
        approval: input.approval,
      },
    );
    const audit = {
      projectId: input.projectId,
      targetType: "requirement",
      targetId: input.requirementId,
      metadata: { approval: input.approval },
    };
    if (!result.ok) return { status: "error", message: result.message, audit };

    revalidatePath(`/projects/${input.projectId}`, "layout");
    const label = { draft: "moved back to draft", approved: "approved", rejected: "rejected" }[
      input.approval
    ];
    return { status: "success", message: `Requirement ${label}.`, audit };
  },
);
