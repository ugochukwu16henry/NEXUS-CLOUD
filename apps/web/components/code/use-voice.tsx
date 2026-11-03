"use client";

import { useEffect, useRef, useState } from "react";
import { announce } from "@/components/ui/announcer";

/** The browser's own speech recognition (Chrome, Edge, Safari); Firefox has none. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => Recognition;

function speechRecognition(): RecognitionConstructor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const MAX_RECORDING_SECONDS = 5 * 60;

export type VoiceState = "off" | "dictating" | "recording" | "transcribing";

/**
 * Voice into a text box: the browser's own speech recognition where it has one (Chrome, Edge,
 * Safari), live and free; otherwise a recording of up to five minutes that the server transcribes
 * (POST /api/transcribe: Groq Whisper, then OpenAI). What is said is added after what was typed.
 */
export function useVoiceInput(projectId: string, text: string, setText: (value: string) => void) {
  const [listening, setListening] = useState<VoiceState>("off");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<{ media: MediaRecorder; started: number; timer: number } | null>(null);
  const base = useRef("");

  useEffect(
    () => () => {
      recognition.current?.stop();
      if (recorder.current) {
        window.clearTimeout(recorder.current.timer);
        recorder.current.media.stop();
      }
    },
    [],
  );

  function joined(addition: string) {
    const start = base.current.trimEnd();
    return start ? `${start} ${addition.trim()}` : addition.trim();
  }

  async function startVoice() {
    setVoiceError(null);
    setVoiceNote(null);
    base.current = text;
    const Speech = speechRecognition();
    if (Speech) {
      const live = new Speech();
      live.lang = navigator.language || "en-US";
      live.continuous = true;
      live.interimResults = true;
      live.onresult = (event) => {
        let spoken = "";
        for (let i = 0; i < event.results.length; i += 1) {
          spoken += event.results[i]![0]!.transcript;
        }
        setText(joined(spoken));
      };
      live.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setVoiceError("The browser didn't allow the microphone. Allow it in the site settings.");
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          setVoiceError("Voice stopped. Tap the mic to try again.");
        }
      };
      live.onend = () => {
        recognition.current = null;
        setListening("off");
      };
      recognition.current = live;
      live.start();
      setListening("dictating");
      announce("Listening. Tap the mic again to stop.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError(
        "This browser can't record audio. Type instead, or use Chrome, Edge or Safari.",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError("The browser didn't allow the microphone. Allow it in the site settings.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    media.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const started = recorder.current?.started ?? Date.now();
      recorder.current = null;
      const seconds = Math.round((Date.now() - started) / 1000);
      const type = media.mimeType || "audio/webm";
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("seconds", String(seconds));
      form.set("audio", new File(chunks, `voice.${extension}`, { type }));
      setListening("transcribing");
      try {
        const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const body = (await response.json()) as { text?: string; message?: string };
        if (!response.ok || typeof body.text !== "string") {
          setVoiceError(body.message ?? "Transcription failed. Try again, or type instead.");
        } else {
          setText(joined(body.text));
          setVoiceNote("Transcribed. Check the text, then send.");
          announce("Transcribed.");
        }
      } catch {
        setVoiceError("No connection. Try again, or type instead.");
      } finally {
        setListening("off");
      }
    };
    media.start();
    recorder.current = {
      media,
      started: Date.now(),
      timer: window.setTimeout(() => media.stop(), MAX_RECORDING_SECONDS * 1000),
    };
    setListening("recording");
    announce("Recording. Tap the mic again to stop.");
  }

  function stopVoice() {
    if (recognition.current) recognition.current.stop();
    if (recorder.current) {
      window.clearTimeout(recorder.current.timer);
      recorder.current.media.stop();
    }
  }

  const micLabel =
    listening === "off"
      ? "Speak instead of typing"
      : listening === "transcribing"
        ? "Transcribing"
        : "Stop listening";

  return {
    listening,
    micLabel,
    voiceNote,
    voiceError,
    setVoiceError,
    toggle: () => (listening === "off" ? void startVoice() : stopVoice()),
  };
}

export function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
