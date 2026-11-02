import "server-only";
import { recordAudit } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === getServerEnv().NEXUS_OWNER_EMAIL;
}

/** Lets the owner's email create an account (the database rejects every other sign-up). */
export async function allowOwnerSignUp(email: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("signup_allowlist")
    .upsert({ email: email.toLowerCase(), reason: "owner" }, { onConflict: "email" });
  if (error) throw new Error(`Could not allow owner sign-up: ${error.message}`);
}

/**
 * Creates the owner's workspace on their first sign-in. Safe to call on every sign-in: the
 * single-owner unique index makes a concurrent second attempt fail instead of creating two.
 */
export async function ensureOwnerWorkspace(userId: string, correlationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("role", "owner")
    .maybeSingle();
  if (lookupError) throw new Error(`Owner lookup failed: ${lookupError.message}`);
  if (existing) return;

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .insert({ name: "Nexus Cloud" })
    .select("id")
    .single();
  if (workspaceError) throw new Error(`Workspace creation failed: ${workspaceError.message}`);

  const { error: membershipError } = await admin
    .from("memberships")
    .insert({ workspace_id: workspace.id, user_id: userId, role: "owner" });
  if (membershipError) {
    // Lost a race with a concurrent sign-in: drop the orphan workspace (it has no audit rows yet).
    await admin.from("workspaces").delete().eq("id", workspace.id);
    if (membershipError.code === "23505") return;
    throw new Error(`Owner membership failed: ${membershipError.message}`);
  }

  await recordAudit({
    workspaceId: workspace.id,
    actorId: userId,
    actorType: "user",
    action: "workspace.bootstrap",
    targetType: "workspace",
    targetId: workspace.id,
    result: "success",
    correlationId,
  });
}
