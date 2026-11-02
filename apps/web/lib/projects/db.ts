import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type VersionedTable = "projects" | "requirements" | "milestones" | "tasks";

export const CONFLICT_MESSAGE =
  "Someone changed this since you opened it. Reload the page to see the latest version, then try again.";

/** Turns database errors into messages a person can act on; rule violations keep their wording. */
export function dbErrorMessage(error: PostgrestError): string {
  if (error.code === "P0001")
    return error.message.replace(/^invalid transition: /, "Not allowed: ");
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23505") return "That already exists.";
  if (error.code === "23503") return "A linked item no longer exists. Reload and try again.";
  if (error.code === "23514") return "Some values are outside what's allowed. Check the form.";
  return "Could not save. Please try again.";
}

export type VersionedUpdateResult = { ok: true; version: number } | { ok: false; message: string };

/**
 * Optimistic concurrency: the update only applies if the row still has the version the user saw.
 * The database bumps the version on every change, so two editors can't overwrite each other.
 */
export async function updateVersioned(
  supabase: Client,
  table: VersionedTable,
  id: string,
  version: number,
  values: Record<string, unknown>,
): Promise<VersionedUpdateResult> {
  const { data, error } = await supabase
    .from(table)
    .update(values as never)
    .eq("id", id)
    .eq("version", version)
    .select("id, version")
    .maybeSingle();
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (data) return { ok: true, version: (data as { version: number }).version };

  const { data: existing } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  return { ok: false, message: existing ? CONFLICT_MESSAGE : "That item no longer exists." };
}
