"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defineAction, invalid, noInput } from "@/lib/actions";
import { getGitHubApp, INSTALL_STATE_COOKIE } from "@/lib/github/app";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sends the owner to GitHub to install (or change) the Nexus GitHub App. A random state value goes
 * in a short-lived HttpOnly cookie; the callback only accepts a return trip carrying the same value.
 */
export const startGitHubInstall = defineAction(
  {
    name: "integration.github_install_start",
    access: "integration:manage",
    parse: noInput,
    mfaReturnTo: "/settings/integrations",
  },
  async () => {
    const app = getGitHubApp();
    if (!app.configured) {
      return { status: "error", message: "The GitHub App isn't configured on this server yet." };
    }
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set(INSTALL_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/integrations/github",
      maxAge: 600,
    });
    redirect(`${app.webUrl}/apps/${app.slug}/installations/new?state=${state}`);
  },
);

/** Puts a failed or dead webhook delivery back in the queue (the dead-letter view's Retry button). */
export const retryDelivery = defineAction(
  {
    name: "integration.webhook_retry",
    access: "integration:manage",
    parse: (formData) => {
      const id = Number(formData.get("deliveryRowId"));
      return Number.isSafeInteger(id) && id > 0 ? { id } : invalid("Unknown delivery.");
    },
    mfaReturnTo: "/settings/integrations",
  },
  async ({ id }) => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("webhook_events")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["failed", "dead"])
      .select("delivery_id")
      .maybeSingle();
    if (error || !data) {
      return {
        status: "error",
        message: "That delivery can't be retried.",
        audit: { targetId: String(id) },
      };
    }
    revalidatePath("/settings/integrations");
    return {
      status: "success",
      message: "Queued again. The worker retries it within a minute.",
      audit: { targetType: "webhook_delivery", targetId: data.delivery_id },
    };
  },
);
