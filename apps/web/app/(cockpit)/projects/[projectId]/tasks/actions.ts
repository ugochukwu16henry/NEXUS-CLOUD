"use server";

import {
  STATE_LABELS,
  checkTransition,
  createsDependencyCycle,
  transitionKind,
  type WorkflowState,
} from "@nexus/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { dbErrorMessage, updateVersioned } from "@/lib/projects/db";
import { parseForm } from "@/lib/projects/parse";
import { id, taskFields, taskMove, version } from "@/lib/projects/schemas";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toArray = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const createInput = taskFields.extend({
  projectId: id,
  state: z.enum(["backlog", "ready"]),
  dependsOn: z.preprocess(toArray, z.array(id).max(20)),
});
const updateInput = taskFields.extend({ projectId: id, taskId: id, version });
const moveInput = taskMove.extend({ returnTo: z.string().optional() });
const dependencyInput = z.object({ projectId: id, taskId: id, dependsOnId: id });

function taskColumns(input: z.infer<typeof taskFields>) {
  return {
    title: input.title,
    description: input.description,
    assignee: input.assignee,
    assignee_type: input.assigneeType,
    budget_usd: input.budgetUsd,
    due_date: input.dueDate,
    acceptance_criteria: input.acceptanceCriteria,
    evidence_links: input.evidenceLinks,
    requirement_id: input.requirementId,
    milestone_id: input.milestoneId,
  };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

export const createTask = defineAction(
  { name: "task.create", access: "project:write", parse: parseForm(createInput) },
  async (input, { annotate }) => {
    annotate({ projectId: input.projectId });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({ project_id: input.projectId, state: input.state, ...taskColumns(input) })
      .select("id, ref")
      .single();
    if (error) return { status: "error", message: dbErrorMessage(error) };

    annotate({ targetType: "task", targetId: data.id, metadata: { ref: data.ref } });
    if (input.dependsOn.length) {
      const { error: depError } = await supabase
        .from("task_dependencies")
        .insert(
          input.dependsOn.map((dependsOnId) => ({ task_id: data.id, depends_on_id: dependsOnId })),
        );
      if (depError) {
        refresh(input.projectId);
        return {
          status: "error",
          message: `NX-${data.ref} was created, but its dependencies were not saved: ${dbErrorMessage(depError)}`,
        };
      }
    }
    refresh(input.projectId);
    redirect(`/projects/${input.projectId}/tasks/${data.id}`);
  },
);

export const updateTask = defineAction(
  { name: "task.update", access: "project:write", parse: parseForm(updateInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const result = await updateVersioned(
      supabase,
      "tasks",
      input.taskId,
      input.version,
      taskColumns(input),
    );
    const audit = { projectId: input.projectId, targetType: "task", targetId: input.taskId };
    if (!result.ok) return { status: "error", message: result.message, audit };

    refresh(input.projectId);
    return {
      status: "success",
      message: "Task saved.",
      data: { version: String(result.version) },
      audit,
    };
  },
);

/**
 * Moves a task to another workflow state. Approval gates need the owner's MFA-verified session;
 * everything else needs normal project write access. The database re-checks the same rules.
 */
export const moveTask = defineAction(
  { name: "task.move", access: "project:write", parse: parseForm(moveInput) },
  async (input, { annotate, require }) => {
    const returnTo = safeRedirectPath(input.returnTo, `/projects/${input.projectId}/board`);
    annotate({
      projectId: input.projectId,
      targetType: "task",
      targetId: input.taskId,
      metadata: { to: input.to },
    });

    if (transitionKind(input.to) === "approve") {
      const denial = require("task:approve", returnTo);
      if (denial) return denial;
    }

    const supabase = await createSupabaseServerClient();
    const [{ data: task }, { data: deps }] = await Promise.all([
      supabase.from("tasks").select("ref, state").eq("id", input.taskId).maybeSingle(),
      supabase
        .from("task_dependencies")
        .select("tasks!task_dependencies_depends_on_id_fkey(state)")
        .eq("task_id", input.taskId),
    ]);
    if (!task) return { status: "error", message: "That task no longer exists." };

    const dependencyStates = (deps ?? []).flatMap((row) => {
      const linked = row.tasks as { state: WorkflowState } | { state: WorkflowState }[] | null;
      return (Array.isArray(linked) ? linked : linked ? [linked] : []).map((t) => t.state);
    });
    const check = checkTransition({
      from: task.state as WorkflowState,
      to: input.to,
      dependencyStates,
      blockedReason: input.blockedReason,
    });
    if (!check.ok) {
      return {
        status: "error",
        message: check.message,
        audit: { result: "denied", metadata: { reason: check.reason } },
      };
    }

    const result = await updateVersioned(supabase, "tasks", input.taskId, input.version, {
      state: input.to,
      blocked_reason: input.to === "blocked" ? input.blockedReason : null,
    });
    if (!result.ok) return { status: "error", message: result.message };

    refresh(input.projectId);
    return {
      status: "success",
      message: `NX-${task.ref} moved to ${STATE_LABELS[input.to]}.`,
      audit: { metadata: { from: task.state } },
    };
  },
);

export const addDependency = defineAction(
  { name: "task.dependency_add", access: "project:write", parse: parseForm(dependencyInput) },
  async (input) => {
    const audit = {
      projectId: input.projectId,
      targetType: "task",
      targetId: input.taskId,
      metadata: { dependsOn: input.dependsOnId },
    };
    const supabase = await createSupabaseServerClient();
    const { data: edges } = await supabase
      .from("task_dependencies")
      .select("task_id, depends_on_id, tasks!task_dependencies_task_id_fkey!inner(project_id)")
      .eq("tasks.project_id", input.projectId);
    const existing = (edges ?? []).map((edge) => ({
      taskId: edge.task_id,
      dependsOnId: edge.depends_on_id,
    }));
    if (createsDependencyCycle(existing, input.taskId, input.dependsOnId)) {
      return {
        status: "error",
        message: "That would make the tasks depend on each other in a loop.",
        audit: { ...audit, result: "denied" },
      };
    }

    const { error } = await supabase
      .from("task_dependencies")
      .insert({ task_id: input.taskId, depends_on_id: input.dependsOnId });
    if (error) return { status: "error", message: dbErrorMessage(error), audit };

    refresh(input.projectId);
    return { status: "success", message: "Dependency added.", audit };
  },
);

export const removeDependency = defineAction(
  { name: "task.dependency_remove", access: "project:write", parse: parseForm(dependencyInput) },
  async (input) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("task_dependencies")
      .delete()
      .eq("task_id", input.taskId)
      .eq("depends_on_id", input.dependsOnId);
    const audit = {
      projectId: input.projectId,
      targetType: "task",
      targetId: input.taskId,
      metadata: { dependsOn: input.dependsOnId },
    };
    if (error) return { status: "error", message: dbErrorMessage(error), audit };

    refresh(input.projectId);
    return { status: "success", message: "Dependency removed.", audit };
  },
);
