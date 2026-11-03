import { timingSafeEqual } from "node:crypto";
import { authorize } from "@nexus/auth";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getGitHubApp, INSTALL_STATE_COOKIE } from "@/lib/github/app";
import { getCorrelationId, reportError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const sameValue = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GitHub sends the owner back here after installing the app, with `installation_id`, a one-time
 * OAuth `code` and our `state`. The installation ID alone proves nothing (anyone can type one into
 * the URL), so it is accepted only if the signed-in GitHub user can access it (threat model T08).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const correlationId = await getCorrelationId();
  const viewer = await getViewer();
  const back = (query: string) =>
    NextResponse.redirect(new URL(`/settings/integrations?${query}`, url));

  const audit = (
    result: "success" | "denied" | "error",
    metadata: Record<string, unknown>,
    targetId?: string,
  ) =>
    recordAudit({
      workspaceId: viewer?.workspaceId ?? null,
      actorId: viewer?.userId ?? null,
      actorType: viewer ? "user" : "system",
      action: "integration.github_install",
      result,
      correlationId,
      targetType: "integration",
      targetId,
      metadata,
    });

  if (!viewer) return NextResponse.redirect(new URL("/login", url));
  const decision = authorize({ role: viewer.role, aal: viewer.aal }, "integration:manage");
  if (!decision.allowed || !viewer.workspaceId) {
    await audit("denied", { reason: decision.allowed ? "no_workspace" : decision.reason });
    return back("error=forbidden");
  }

  const jar = await cookies();
  const expected = jar.get(INSTALL_STATE_COOKIE)?.value ?? "";
  jar.delete({ name: INSTALL_STATE_COOKIE, path: "/integrations/github" });
  const state = url.searchParams.get("state") ?? "";
  if (!expected || !sameValue(state, expected)) {
    await audit("denied", { reason: "state_mismatch" });
    return back("error=state");
  }

  if (url.searchParams.get("setup_action") === "request") {
    await audit("success", { reason: "approval_requested" });
    return back("notice=requested");
  }

  const installationId = Number(url.searchParams.get("installation_id"));
  const code = url.searchParams.get("code");
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !code) {
    await audit("denied", { reason: code ? "bad_installation_id" : "no_code" });
    return back("error=incomplete");
  }

  const app = getGitHubApp();
  if (!app.configured) return back("error=not_configured");

  try {
    const userToken = await app.client.exchangeCode(code);
    const mine = await app.client.userInstallationIds(userToken);
    if (!mine.includes(installationId)) {
      await audit("denied", { reason: "not_users_installation", installationId });
      return back("error=not_yours");
    }

    const installation = await app.client.getInstallation(installationId);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("integrations")
      .upsert(
        {
          workspace_id: viewer.workspaceId,
          provider: "github",
          installation_id: installation.id,
          account_login: installation.accountLogin,
          account_type: installation.accountType,
          repository_selection: installation.repositorySelection,
          permissions: installation.permissions,
          status: installation.suspended ? "suspended" : "active",
          installed_by: viewer.userId,
          last_ok_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "workspace_id,provider" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`store installation: ${error.message}`);

    await audit(
      "success",
      { account: installation.accountLogin, repositories: installation.repositorySelection },
      data.id,
    );
    return back("notice=connected");
  } catch (error) {
    reportError(error, { step: "github_install", correlationId });
    await audit("error", { reason: error instanceof Error ? error.name : "unknown" });
    return back("error=github");
  }
}
