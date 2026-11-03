import "server-only";
import type { Database } from "@nexus/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LedgerRow = Pick<
  Database["public"]["Tables"]["usage_ledger"]["Row"],
  | "id"
  | "created_at"
  | "provider"
  | "model"
  | "cost_usd_micros"
  | "ok"
  | "fallback_from_provider"
  | "fallback_from_model"
  | "input_tokens"
  | "output_tokens"
  | "image_count"
  | "project_id"
>;

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getProjectModelSettings(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("project_model_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

export async function projectSpentMicros(projectId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("usage_ledger")
    .select("cost_usd_micros")
    .eq("project_id", projectId)
    .gte("created_at", monthStart());
  return (data ?? []).reduce((sum, row) => sum + row.cost_usd_micros, 0);
}

export async function getSpendCap() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("spend_caps")
    .select("*")
    .eq("scope", "global")
    .maybeSingle();
  return data;
}

export async function getModelRoutes() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("model_routes")
    .select("task_kind, provider, model")
    .order("task_kind");
  return data ?? [];
}

export async function listRecentUsage(): Promise<{ row: LedgerRow; projectName: string }[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: projects }] = await Promise.all([
    supabase
      .from("usage_ledger")
      .select(
        "id, created_at, provider, model, cost_usd_micros, ok, fallback_from_provider, fallback_from_model, input_tokens, output_tokens, image_count, project_id",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("projects").select("id, name"),
  ]);
  const names = new Map((projects ?? []).map((project) => [project.id, project.name]));
  return (rows ?? []).map((row) => ({ row, projectName: names.get(row.project_id) ?? "Project" }));
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
