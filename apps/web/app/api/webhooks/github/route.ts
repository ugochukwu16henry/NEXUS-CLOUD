import { processDueDeliveries, verifyGitHubSignature } from "@nexus/integrations";
import { after, NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { getGitHubApp } from "@/lib/github/app";
import { getCorrelationId, logger, reportError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** GitHub's own payloads can be large; ours never need more than this. */
const MAX_BODY_BYTES = 1_000_000;
const DELIVERY_ID = /^[0-9a-f-]{8,64}$/i;
const EVENT_NAME = /^[a-z_]{1,64}$/;

/**
 * The GitHub webhook inbox (threat model T06, T07). Each delivery is verified against its HMAC
 * signature before anything else, stored once by its delivery ID, acknowledged, and then applied
 * after the response. Failures are retried by the worker and end in the dead-letter view.
 */
export async function POST(request: NextRequest) {
  const correlationId = await getCorrelationId();
  const log = logger.child({ correlationId, route: "webhooks.github" });
  const event = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";

  const app = getGitHubApp();
  if (!app.configured)
    return new NextResponse("GitHub integration is not configured", { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES)
    return new NextResponse("Payload too large", { status: 413 });

  if (!verifyGitHubSignature(app.webhookSecret, body, request.headers.get("x-hub-signature-256"))) {
    // Forged or misconfigured: logged and audited, never stored or processed.
    log.warn("webhook signature rejected", { event, deliveryId: deliveryId.slice(0, 64) });
    await recordAudit({
      workspaceId: null,
      actorId: null,
      actorType: "system",
      action: "github.webhook_rejected",
      result: "denied",
      correlationId,
      metadata: {
        reason: "bad_signature",
        event: event.slice(0, 64),
        delivery: deliveryId.slice(0, 64),
      },
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  if (!DELIVERY_ID.test(deliveryId) || !EVENT_NAME.test(event)) {
    return new NextResponse("Missing delivery headers", { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return new NextResponse("Body is not JSON", { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const installation = payload.installation as { id?: unknown } | undefined;
  const { data, error } = await admin
    .from("webhook_events")
    .upsert(
      {
        delivery_id: deliveryId,
        event,
        action: typeof payload.action === "string" ? payload.action.slice(0, 100) : null,
        installation_id: typeof installation?.id === "number" ? installation.id : null,
        payload: payload as never,
      },
      { onConflict: "delivery_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    reportError(new Error(`store webhook: ${error.message}`), { correlationId });
    // 5xx makes GitHub redeliver later.
    return new NextResponse("Could not store delivery", { status: 500 });
  }
  if (!data || data.length === 0) {
    // Seen before (a GitHub redelivery or a replay): acknowledged, applied only once.
    log.info("duplicate webhook delivery ignored", { event, deliveryId });
    return NextResponse.json({ duplicate: true }, { status: 200 });
  }

  // Applied after the response, so GitHub's 10-second timeout never matters; the worker retries.
  after(async () => {
    try {
      await processDueDeliveries(createSupabaseAdminClient(), { deliveryId, batchSize: 1 });
    } catch (processError) {
      reportError(processError, { correlationId, deliveryId });
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
