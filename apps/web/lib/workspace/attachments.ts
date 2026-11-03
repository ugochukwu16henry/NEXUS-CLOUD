import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Raster images that are safe to show inline. SVG never is: it can carry scripts (T31). */
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const LINK_SECONDS = 300;

export type Attachment = {
  id: string;
  filename: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Short-lived link: shown inline for raster images, a download for everything else. */
  url: string | null;
  inline: boolean;
};

/**
 * A task's attachments. The list is read as the signed-in owner (RLS decides what exists); the
 * links are signed with the secret key, expire in five minutes, and force a download for anything
 * that isn't a plain raster image.
 */
export async function listTaskAttachments(taskId: string): Promise<Attachment[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("artifacts")
    .select("id, filename, kind, content_type, size_bytes, storage_key, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (!data || data.length === 0) return [];

  const admin = createSupabaseAdminClient();
  return Promise.all(
    data.map(async (row) => {
      const inline = INLINE.has(row.content_type);
      const { data: signed } = await admin.storage
        .from("attachments")
        .createSignedUrl(
          row.storage_key,
          LINK_SECONDS,
          inline ? undefined : { download: row.filename },
        );
      return {
        id: row.id,
        filename: row.filename,
        kind: row.kind,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        url: signed?.signedUrl ?? null,
        inline,
      };
    }),
  );
}
