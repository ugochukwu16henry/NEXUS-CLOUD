"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defineAction, invalid, noInput } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const updateProfile = defineAction(
  {
    name: "profile.update",
    access: "profile:update",
    parse: (formData) => {
      const displayName = String(formData.get("displayName") ?? "").trim();
      if (displayName.length > 80) return invalid("Display name must be 80 characters or fewer.");
      return { displayName: displayName || null };
    },
  },
  async ({ displayName }, { viewer }) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", viewer!.userId);
    const audit = { targetType: "profile", targetId: viewer!.userId };
    if (error) return { status: "error", message: "Could not save your profile.", audit };
    revalidatePath("/", "layout");
    return { status: "success", message: "Profile saved.", audit };
  },
);

/** Risk action: needs a verified second factor in this session (see RISK_PERMISSIONS). */
export const revokeAllSessions = defineAction(
  {
    name: "session.revoke_all",
    access: "session:revoke_all",
    parse: noInput,
    mfaReturnTo: "/settings",
  },
  async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return { status: "error", message: "Could not sign out other sessions." };
    redirect("/login?notice=signed_out_all");
  },
);
