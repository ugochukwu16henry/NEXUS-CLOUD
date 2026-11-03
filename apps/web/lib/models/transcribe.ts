import "server-only";
import type { Database } from "@nexus/db";
import { usdToMicros } from "@nexus/model-gateway";
import { getServerEnv } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowFixtureMode } from "./fixture-mode";

type Provider = Database["public"]["Enums"]["model_provider"];

/**
 * Speech to text for the agent composer when the browser can't transcribe on its own (Firefox,
 * some phones). Groq's hosted Whisper comes first: it has a free tier and is the cheapest; OpenAI
 * is the fallback. Prices checked 2026-11-03 against the providers' pricing pages and aggregators;
 * re-check them when a provider changes its list.
 */
export const TRANSCRIBERS = [
  {
    provider: "groq" as const,
    model: "whisper-large-v3-turbo",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    // $0.04 per audio hour, billed for at least 10 seconds.
    usdPerSecond: 0.04 / 3600,
    minimumSeconds: 10,
  },
  {
    provider: "openai" as const,
    model: "gpt-4o-mini-transcribe",
    url: "https://api.openai.com/v1/audio/transcriptions",
    // About $0.003 per minute.
    usdPerSecond: 0.003 / 60,
    minimumSeconds: 1,
  },
];

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 5 * 60;

export type TranscriptionResult =
  | { ok: true; text: string; provider: string; costUsdMicros: number }
  | { ok: false; status: number; message: string };

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function transcribe(input: {
  projectId: string;
  audio: File;
  seconds: number;
}): Promise<TranscriptionResult> {
  const env = getServerEnv();
  const seconds = Math.min(MAX_AUDIO_SECONDS, Math.max(1, Math.ceil(input.seconds)));
  if (allowFixtureMode(env.NEXUS_MODEL_FIXTURE, env.NEXT_PUBLIC_SUPABASE_URL)) {
    return {
      ok: true,
      text: "Recorded transcript from the microphone.",
      provider: "fixture",
      costUsdMicros: 0,
    };
  }
  const keys: Record<string, string | undefined> = {
    groq: env.GROQ_API_KEY,
    openai: env.OPENAI_API_KEY,
  };
  const available = TRANSCRIBERS.filter((item) => keys[item.provider]);
  if (available.length === 0) {
    return {
      ok: false,
      status: 503,
      message:
        "Voice needs a transcription key on the server: add GROQ_API_KEY (free tier) or OPENAI_API_KEY.",
    };
  }

  // The budget guard runs before any provider is contacted (ADR 0007), like every model call.
  const admin = createSupabaseAdminClient();
  const [{ data: settings }, { data: spent }, { data: cap }, { data: allSpent }] =
    await Promise.all([
      admin
        .from("project_model_settings")
        .select("monthly_budget_usd, extended_until, allowed_providers")
        .eq("project_id", input.projectId)
        .maybeSingle(),
      admin
        .from("usage_ledger")
        .select("cost_usd_micros")
        .eq("project_id", input.projectId)
        .gte("created_at", monthStart()),
      admin
        .from("spend_caps")
        .select("monthly_usd, extended_until")
        .eq("scope", "global")
        .maybeSingle(),
      admin.from("usage_ledger").select("cost_usd_micros").gte("created_at", monthStart()),
    ]);
  const allowed = new Set(settings?.allowed_providers ?? []);
  const candidates = available.filter((item) => allowed.size === 0 || allowed.has(item.provider));
  if (candidates.length === 0) {
    return {
      ok: false,
      status: 403,
      message:
        "Groq and OpenAI are switched off for this project. Turn one on in Project → Settings → Models.",
    };
  }
  const projectSpent = (spent ?? []).reduce((sum, row) => sum + row.cost_usd_micros, 0);
  const limit = usdToMicros(Number(settings?.monthly_budget_usd ?? 5));
  const lifted = (until: string | null | undefined) =>
    typeof until === "string" && new Date(until).getTime() > Date.now();
  const globalSpent = (allSpent ?? []).reduce((sum, row) => sum + row.cost_usd_micros, 0);
  const globalLimit = usdToMicros(Number(cap?.monthly_usd ?? 20));

  for (const transcriber of candidates) {
    const costUsdMicros = usdToMicros(
      Math.max(seconds, transcriber.minimumSeconds) * transcriber.usdPerSecond,
    );
    if (!lifted(settings?.extended_until) && projectSpent + costUsdMicros >= limit) {
      return {
        ok: false,
        status: 402,
        message:
          "Stopped: the project budget is used up. Raise it in Project → Settings → Models, or lift the stop.",
      };
    }
    if (!lifted(cap?.extended_until) && globalSpent + costUsdMicros >= globalLimit) {
      return {
        ok: false,
        status: 402,
        message:
          "Stopped: the monthly cap is used up. Raise it in Settings → Models, or lift the stop.",
      };
    }
    const started = Date.now();
    const form = new FormData();
    form.set("file", input.audio, input.audio.name || "voice.webm");
    form.set("model", transcriber.model);
    form.set("response_format", "json");
    let text: string | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch(transcriber.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${keys[transcriber.provider]}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const body = (await response.json()) as { text?: unknown };
        text = typeof body.text === "string" ? body.text.trim() : "";
      } else {
        failure = `status ${response.status}`;
      }
    } catch {
      failure = "unreachable";
    }
    const { error } = await admin.from("usage_ledger").insert({
      project_id: input.projectId,
      provider: transcriber.provider as Provider,
      model: transcriber.model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: text === null ? 0 : costUsdMicros,
      ok: text !== null,
      error: failure,
      latency_ms: Date.now() - started,
    });
    if (error) reportError(error, { action: "voice.transcribe", projectId: input.projectId });
    if (text !== null) return { ok: true, text, provider: transcriber.provider, costUsdMicros };
  }
  return {
    ok: false,
    status: 502,
    message: "Transcription failed with every configured provider. Try again, or type instead.",
  };
}
