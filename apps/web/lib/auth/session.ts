import "server-only";
import type { AssuranceLevel, Role } from "@nexus/auth";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string;
  displayName: string | null;
  aal: AssuranceLevel;
  /** True when the user has a verified TOTP factor and could step up to aal2. */
  hasMfa: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  role: Role | null;
};

const ROLE_PRIORITY: Record<Role, number> = { owner: 0, client: 1, viewer: 2 };

/** The signed-in user for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  // The JWT is verified locally first so the database reads can start straight away. getUser()
  // still decides: it asks the Auth server, which also rejects sessions revoked elsewhere.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const [{ data: userData }, { data: aalData }, { data: memberships }, { data: profile }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase
        .from("memberships")
        .select("role, workspace_id, workspaces(name)")
        .eq("user_id", userId),
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
  const user = userData.user;
  if (!user || user.id !== userId) return null;

  // Release 1 has a single workspace per user (ADR 0012); prefer the highest role if several.
  const membership = [...(memberships ?? [])].sort(
    (a, b) => ROLE_PRIORITY[a.role as Role] - ROLE_PRIORITY[b.role as Role],
  )[0];
  const workspace = membership?.workspaces as
    { name: string } | { name: string }[] | null | undefined;

  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
    aal: aalData?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasMfa: aalData?.nextLevel === "aal2",
    workspaceId: membership?.workspace_id ?? null,
    workspaceName: (Array.isArray(workspace) ? workspace[0]?.name : workspace?.name) ?? null,
    role: (membership?.role as Role | undefined) ?? null,
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
