import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Read-side queries for the GitHub integration. They run as the signed-in user, so RLS applies. */

export const getGitHubIntegration = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("integrations")
    .select(
      "id, installation_id, account_login, account_type, repository_selection, permissions, status, last_ok_at, last_error_at, last_error, created_at",
    )
    .eq("provider", "github")
    .maybeSingle();
  return data;
});

export async function listRecentDeliveries(limit = 20) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("webhook_events")
    .select(
      "id, delivery_id, event, action, status, attempts, last_error, received_at, processed_at",
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type Health = { state: "healthy" | "degraded" | "unknown"; reason: string };

/**
 * The integration health indicator: degraded when the last GitHub call failed after the last good
 * one, or when deliveries have run out of retries.
 */
export function integrationHealth(
  integration: {
    status: string;
    last_ok_at: string | null;
    last_error_at: string | null;
    last_error: string | null;
  },
  deadDeliveries: number,
): Health {
  if (integration.status !== "active") {
    return { state: "degraded", reason: `The installation is ${integration.status} on GitHub.` };
  }
  const lastOk = integration.last_ok_at ? Date.parse(integration.last_ok_at) : 0;
  const lastError = integration.last_error_at ? Date.parse(integration.last_error_at) : 0;
  if (lastError > lastOk) {
    return { state: "degraded", reason: integration.last_error ?? "The last GitHub call failed." };
  }
  if (deadDeliveries > 0) {
    return {
      state: "degraded",
      reason: `${deadDeliveries} webhook ${deadDeliveries === 1 ? "delivery" : "deliveries"} failed every retry.`,
    };
  }
  if (!lastOk) return { state: "unknown", reason: "No GitHub calls yet." };
  return { state: "healthy", reason: "GitHub is answering normally." };
}
