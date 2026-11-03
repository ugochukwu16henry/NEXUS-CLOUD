"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { parseForm } from "@/lib/projects/parse";
import { id } from "@/lib/projects/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const number = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int()
    .min(min, { error: `${label} must be at least ${min}.` })
    .max(max, { error: `${label} can be at most ${max}.` });

const settingsInput = z.object({
  projectId: id,
  maxFileMb: number(1, 100, "Largest file"),
  maxUploadMb: number(1, 1000, "Largest upload"),
  maxFiles: number(1, 5000, "Files per upload"),
  attachmentMaxMb: number(1, 100, "Largest attachment"),
  // Checkboxes: present = "on".
  kindImage: z.literal("on").optional(),
  kindPdf: z.literal("on").optional(),
  kindText: z.literal("on").optional(),
  kindOther: z.literal("on").optional(),
  skipFolders: z
    .string()
    .max(1000)
    .transform((value) =>
      [
        ...new Set(
          value
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ].slice(0, 50),
    )
    .refine((folders) => folders.every((folder) => /^[A-Za-z0-9._-]{1,100}$/.test(folder)), {
      error: "Folder names may only use letters, digits, dots, dashes and underscores.",
    }),
  nodeMajor: number(20, 24, "Node version"),
  installCommand: z.string().trim().min(1).max(200),
  testCommand: z.string().trim().min(1).max(200),
  buildCommand: z.string().trim().min(1).max(200),
  startCommand: z.string().trim().min(1).max(200),
  terminalIdleSeconds: number(60, 3600, "Terminal idle timeout"),
  terminalMaxSessions: number(1, 8, "Open terminals"),
  approvalMode: z.enum(["ask", "safe_list", "custom"]),
  customCommands: z
    .string()
    .max(2000)
    .transform((value) =>
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 40),
    ),
  agentMaxIterations: number(1, 30, "Agent iterations"),
  plainEnv: z.string().max(4000),
});

/** Project → Settings → Workspace (ADR 0016): upload limits, attachment types, folders to skip. */
export const updateWorkspaceSettings = defineAction(
  { name: "workspace.settings", access: "project:write", parse: parseForm(settingsInput) },
  async (input) => {
    const audit = { projectId: input.projectId, targetType: "project", targetId: input.projectId };
    // The project must be visible to this owner (RLS) before the server writes on its behalf.
    const supabase = await createSupabaseServerClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (!project) return { status: "error", message: "That project no longer exists.", audit };
    if (input.maxFileMb > input.maxUploadMb) {
      return {
        status: "error",
        message: "The largest file can't be bigger than the largest upload.",
        audit,
      };
    }
    const kinds = (
      [
        ["image", input.kindImage],
        ["pdf", input.kindPdf],
        ["text", input.kindText],
        ["other", input.kindOther],
      ] as const
    )
      .filter(([, on]) => on)
      .map(([kind]) => kind);
    const plainEnv: Record<string, string> = {};
    for (const line of input.plainEnv.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        return { status: "error", message: "Each env line must be NAME=value.", audit };
      }
      const key = trimmed.slice(0, eq);
      if (
        !/^[A-Z_][A-Z0-9_]{0,40}$/.test(key) ||
        /SECRET|TOKEN|PASSWORD|CREDENTIAL|KEY/.test(key)
      ) {
        return {
          status: "error",
          message: `${key} looks like a secret. Secrets stay in the secret store, not this form.`,
          audit,
        };
      }
      plainEnv[key] = trimmed.slice(eq + 1);
    }

    const { error } = await createSupabaseAdminClient().from("workspace_settings").upsert({
      project_id: input.projectId,
      max_file_mb: input.maxFileMb,
      max_upload_mb: input.maxUploadMb,
      max_files: input.maxFiles,
      attachment_max_mb: input.attachmentMaxMb,
      attachment_kinds: kinds,
      skip_folders: input.skipFolders,
      node_major: input.nodeMajor,
      install_command: input.installCommand,
      test_command: input.testCommand,
      build_command: input.buildCommand,
      start_command: input.startCommand,
      terminal_idle_seconds: input.terminalIdleSeconds,
      terminal_max_sessions: input.terminalMaxSessions,
      approval_mode: input.approvalMode,
      custom_commands: input.customCommands,
      agent_max_iterations: input.agentMaxIterations,
      plain_env: plainEnv,
    });
    if (error) return { status: "error", message: "Couldn't save the workspace settings.", audit };
    revalidatePath(`/projects/${input.projectId}`, "layout");
    return {
      status: "success",
      message: "Workspace settings saved.",
      audit: {
        ...audit,
        metadata: { maxFileMb: input.maxFileMb, maxFiles: input.maxFiles, kinds },
      },
    };
  },
);
