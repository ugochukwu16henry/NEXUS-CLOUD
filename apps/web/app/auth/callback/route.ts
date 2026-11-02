import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { ensureOwnerWorkspace, isOwnerEmail } from "@/lib/auth/bootstrap";
import { getCorrelationId, reportError } from "@/lib/observability";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Completes magic-link and GitHub sign-in (PKCE code exchange), then bootstraps the owner. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));
  const correlationId = await getCorrelationId();
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, url));

  if (!code) {
    await recordAudit({
      workspaceId: null,
      actorId: null,
      actorType: "system",
      action: "auth.sign_in",
      result: "denied",
      correlationId,
      metadata: { reason: url.searchParams.get("error_code") ?? "missing_code" },
    });
    return fail("link_invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    await recordAudit({
      workspaceId: null,
      actorId: null,
      actorType: "system",
      action: "auth.sign_in",
      result: "denied",
      correlationId,
      metadata: { reason: error?.code ?? "exchange_failed" },
    });
    return fail("link_invalid");
  }

  const user = data.user;
  try {
    if (isOwnerEmail(user.email)) await ensureOwnerWorkspace(user.id, correlationId);
  } catch (bootstrapError) {
    reportError(bootstrapError, { step: "owner_bootstrap", correlationId });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  await recordAudit({
    workspaceId: membership?.workspace_id ?? null,
    actorId: user.id,
    actorType: "user",
    action: "auth.sign_in",
    result: "success",
    correlationId,
    metadata: { method: user.app_metadata.provider ?? "email" },
  });

  return NextResponse.redirect(new URL(next, url));
}
