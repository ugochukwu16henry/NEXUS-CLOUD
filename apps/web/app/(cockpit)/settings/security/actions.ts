"use server";

import { revalidatePath } from "next/cache";
import { defineAction, invalid, noInput } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CODE = /^\d{6}$/;

/** Starts TOTP enrolment and returns the QR code and secret for the user's authenticator app. */
export const startTotpEnrollment = defineAction(
  { name: "auth.mfa_enroll_started", access: "authenticated", parse: noInput },
  async () => {
    const supabase = await createSupabaseServerClient();

    // An abandoned earlier attempt leaves an unverified factor behind; clear it first.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (factors?.totp.some((f) => f.status === "verified")) {
      return { status: "error", message: "An authenticator app is already set up." };
    }
    for (const stale of factors?.all.filter((f) => f.status === "unverified") ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    if (error || !data) return { status: "error", message: "Could not start setup. Try again." };

    return {
      status: "success",
      data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
      audit: { targetType: "mfa_factor", targetId: data.id },
    };
  },
);

export const verifyTotpEnrollment = defineAction(
  {
    name: "auth.mfa_enrolled",
    access: "authenticated",
    parse: (formData) => {
      const factorId = String(formData.get("factorId") ?? "");
      const code = String(formData.get("code") ?? "").replace(/\s/g, "");
      if (!factorId) return invalid("Start setup again.");
      if (!CODE.test(code)) return invalid("Enter the 6-digit code from your authenticator app.");
      return { factorId, code };
    },
  },
  async ({ factorId, code }) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    const audit = { targetType: "mfa_factor", targetId: factorId };
    if (error) {
      return {
        status: "error",
        message: "That code didn't work. Check the time on your phone and try again.",
        audit: { ...audit, result: "denied" as const },
      };
    }
    revalidatePath("/", "layout");
    return { status: "success", message: "Two-factor authentication is on.", audit };
  },
);
