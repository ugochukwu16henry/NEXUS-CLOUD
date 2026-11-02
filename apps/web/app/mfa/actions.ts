"use server";

import { redirect } from "next/navigation";
import { defineAction, invalid } from "@/lib/actions";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CODE = /^\d{6}$/;

/** Steps the session up to aal2 with the user's verified authenticator. */
export const verifyMfaChallenge = defineAction(
  {
    name: "auth.mfa_verified",
    access: "authenticated",
    parse: (formData) => {
      const code = String(formData.get("code") ?? "").replace(/\s/g, "");
      if (!CODE.test(code)) return invalid("Enter the 6-digit code from your authenticator app.");
      return { code, next: safeRedirectPath(formData.get("next")) };
    },
  },
  async ({ code, next }) => {
    const supabase = await createSupabaseServerClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (!factor) {
      return {
        status: "error",
        message: "Set up an authenticator app first.",
        audit: { result: "denied" },
      };
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      return {
        status: "error",
        message: "That code didn't work. Check the time on your phone and try again.",
        audit: { result: "denied", targetType: "mfa_factor", targetId: factor.id },
      };
    }
    redirect(next);
  },
);
