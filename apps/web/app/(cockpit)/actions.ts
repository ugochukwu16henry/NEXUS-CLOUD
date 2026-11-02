"use server";

import { redirect } from "next/navigation";
import { defineAction, noInput } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const signOut = defineAction(
  { name: "auth.sign_out", access: "authenticated", parse: noInput },
  async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?notice=signed_out");
  },
);
