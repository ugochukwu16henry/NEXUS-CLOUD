"use server";

import { revalidatePath } from "next/cache";
import { PROVIDER_IDS } from "@nexus/model-gateway";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { parseForm } from "@/lib/projects/parse";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PROVIDERS = PROVIDER_IDS;
const KINDS = ["planning", "routine", "complex_code", "review", "research"] as const;

const capInput = z.object({
  monthlyUsd: z.coerce
    .number({ error: "Enter the monthly cap in USD." })
    .positive({ error: "The monthly cap has to be greater than zero." })
    .max(1_000_000)
    .transform((value) => Math.round(value * 100) / 100),
  version: z.coerce.number().int().positive(),
});

export const updateGlobalCap = defineAction(
  {
    name: "budget.update_global",
    access: "budget:extend",
    mfaReturnTo: "/settings/models",
    parse: parseForm(capInput),
  },
  async (input) => {
    const { data, error } = await createSupabaseAdminClient()
      .from("spend_caps")
      .update({ monthly_usd: input.monthlyUsd })
      .eq("scope", "global")
      .eq("version", input.version)
      .select("version")
      .maybeSingle();
    if (error || !data) {
      return {
        status: "error",
        message: "The cap changed while this page was open. Reload and try again.",
      };
    }
    revalidatePath("/settings/models");
    return {
      status: "success",
      message: "Monthly cap saved.",
      audit: { metadata: { monthlyUsd: input.monthlyUsd } },
    };
  },
);

export const liftGlobalStop = defineAction(
  {
    name: "budget.extend_global",
    access: "budget:extend",
    mfaReturnTo: "/settings/models",
    parse: () => ({}),
  },
  async () => {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await createSupabaseAdminClient()
      .from("spend_caps")
      .update({ extended_until: until })
      .eq("scope", "global");
    if (error) return { status: "error", message: "Couldn't lift the stop." };
    revalidatePath("/settings/models");
    return { status: "success", message: "Monthly stop lifted for 24 hours." };
  },
);

const routeInput = z.object({
  planningProvider: z.enum(PROVIDERS),
  planningModel: z.string().trim().min(1).max(120),
  routineProvider: z.enum(PROVIDERS),
  routineModel: z.string().trim().min(1).max(120),
  complex_codeProvider: z.enum(PROVIDERS),
  complex_codeModel: z.string().trim().min(1).max(120),
  reviewProvider: z.enum(PROVIDERS),
  reviewModel: z.string().trim().min(1).max(120),
  researchProvider: z.enum(PROVIDERS),
  researchModel: z.string().trim().min(1).max(120),
});

export const updateRoutes = defineAction(
  { name: "model.routes", access: "settings:update", parse: parseForm(routeInput) },
  async (input) => {
    const admin = createSupabaseAdminClient();
    const rows = KINDS.map((kind) => ({
      task_kind: kind,
      provider: input[`${kind}Provider`],
      model: input[`${kind}Model`],
    }));
    const { error } = await admin.from("model_routes").upsert(rows);
    if (error) return { status: "error", message: "Couldn't save the routes." };
    revalidatePath("/settings/models");
    return {
      status: "success",
      message: "Routes saved. These are defaults, not a claim that a benchmark picked them.",
    };
  },
);
