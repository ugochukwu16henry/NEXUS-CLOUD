import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { MAX_AUDIO_BYTES, transcribe } from "@/lib/models/transcribe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Voice to text for the agent composer (owner only). The proxy refuses cross-site posts to /api.
 * Audio is sent to the transcription provider and not stored; the text comes back to the page.
 */
const fields = z.object({
  projectId: z.uuid(),
  seconds: z.coerce.number().min(0).max(600),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  if (viewer.role !== "owner") {
    return NextResponse.json({ message: "Only the owner can use voice here." }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const parsed = fields.safeParse({
    projectId: form?.get("projectId"),
    seconds: form?.get("seconds"),
  });
  if (!parsed.success || !(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES || !/^(audio|video)\//.test(audio.type || "audio/webm")) {
    return NextResponse.json(
      { message: "That recording is too long. Keep it under five minutes." },
      { status: 413 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const result = await transcribe({ projectId: project.id, audio, seconds: parsed.data.seconds });
  await recordAudit({
    workspaceId: project.workspace_id,
    projectId: project.id,
    actorId: viewer.userId,
    actorType: "user",
    action: "voice.transcribe",
    targetType: "project",
    targetId: project.id,
    result: result.ok ? "success" : "error",
    metadata: result.ok
      ? {
          provider: result.provider,
          seconds: parsed.data.seconds,
          costUsdMicros: result.costUsdMicros,
        }
      : { status: result.status },
  });
  return result.ok
    ? NextResponse.json({ text: result.text, provider: result.provider })
    : NextResponse.json({ message: result.message }, { status: result.status });
}
