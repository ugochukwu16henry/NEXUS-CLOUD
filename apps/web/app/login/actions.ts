"use server";

import { redactString } from "@nexus/observability";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction, invalid, noInput } from "@/lib/actions";
import { allowOwnerSignUp, isOwnerEmail } from "@/lib/auth/bootstrap";
import { isGitHubSignInEnabled } from "@/lib/env";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const emailSchema = z.email().max(254);

/** Same message whether or not the account exists, so the form cannot be used to probe emails. */
const LINK_SENT = "If this email has access, a sign-in link is on its way. Check your inbox.";

export const requestMagicLink = defineAction(
  {
    name: "auth.magic_link_requested",
    access: "public",
    parse: (formData) => {
      const parsed = emailSchema.safeParse(
        String(formData.get("email") ?? "")
          .trim()
          .toLowerCase(),
      );
      return parsed.success ? { email: parsed.data } : invalid("Enter a valid email address.");
    },
  },
  async ({ email }, { log }) => {
    const owner = isOwnerEmail(email);
    if (owner) await allowOwnerSignUp(email);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Only the owner may create an account here; everyone else must already exist (invited).
        shouldCreateUser: owner,
        emailRedirectTo: `${await getRequestOrigin()}/auth/callback`,
      },
    });

    const audit = { targetType: "email", metadata: { email: redactString(email) } };
    if (error?.status === 429) {
      return {
        status: "error",
        message: "Too many sign-in attempts. Please wait a minute.",
        audit,
      };
    }
    if (error) {
      // Unknown or uninvited emails land here; log it, but answer exactly as for a real account.
      log.info("magic link not sent", { reason: error.code ?? error.message });
      return { status: "success", message: LINK_SENT, audit: { ...audit, result: "denied" } };
    }
    return { status: "success", message: LINK_SENT, audit };
  },
);

export const signInWithGitHub = defineAction(
  { name: "auth.oauth_started", access: "public", parse: noInput },
  async () => {
    if (!isGitHubSignInEnabled()) {
      return { status: "error", message: "GitHub sign-in is not enabled." };
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${await getRequestOrigin()}/auth/callback` },
    });
    if (error || !data.url) {
      return { status: "error", message: "Could not start GitHub sign-in." };
    }
    redirect(data.url);
  },
);
