"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { dbErrorMessage, updateVersioned } from "@/lib/projects/db";
import { parseForm } from "@/lib/projects/parse";
import { id, projectFields, projectUpdate, version } from "@/lib/projects/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const createProject = defineAction(
  {
    name: "project.create",
    access: "project:write",
    parse: parseForm(projectFields),
  },
  async (input, { viewer, annotate }) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: viewer!.workspaceId!,
        name: input.name,
        stack: input.stack,
        environments: input.environments.length
          ? input.environments
          : ["dev", "staging", "production"],
        budget_usd: input.budgetUsd,
      })
      .select("id")
      .single();
    if (error) return { status: "error", message: dbErrorMessage(error) };

    annotate({ projectId: data.id, targetType: "project", targetId: data.id });
    revalidatePath("/projects");
    redirect(`/projects/${data.id}`);
  },
);

export const updateProject = defineAction(
  {
    name: "project.update",
    access: "project:write",
    parse: parseForm(projectUpdate),
  },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(supabase, "projects", input.projectId, input.version, {
      name: input.name,
      stack: input.stack,
      environments: input.environments,
      budget_usd: input.budgetUsd,
      status: input.status,
    });
    const audit = { projectId: input.projectId, targetType: "project", targetId: input.projectId };
    if (!result.ok) return { status: "error", message: result.message, audit };

    revalidatePath(`/projects/${input.projectId}`, "layout");
    return {
      status: "success",
      message: "Project saved.",
      data: { version: String(result.version) },
      audit,
    };
  },
);

const archiveInput = z.object({ projectId: id, version, archive: z.enum(["true", "false"]) });

/** Projects are never deleted; archiving hides them and keeps their history. */
export const setProjectArchived = defineAction(
  {
    name: "project.archive",
    access: "project:write",
    parse: parseForm(archiveInput),
  },
  async (input, { annotate }) => {
    const archive = input.archive === "true";
    annotate({
      projectId: input.projectId,
      targetType: "project",
      targetId: input.projectId,
      metadata: { archived: archive },
    });
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(supabase, "projects", input.projectId, input.version, {
      archived_at: archive ? new Date().toISOString() : null,
    });
    if (!result.ok) return { status: "error", message: result.message };

    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`, "layout");
    return { status: "success", message: archive ? "Project archived." : "Project restored." };
  },
);
