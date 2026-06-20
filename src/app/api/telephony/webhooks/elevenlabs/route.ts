import { NextRequest, NextResponse } from "next/server";
import { finalizeElevenLabsPremiumCall } from "@/lib/elevenlabs/finalize-premium-call";
import type { TranscriptEntry } from "@/types/voice-agent-call";

/** POST — webhook post-llamada ElevenLabs (transcripción / audio). */
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const type = String(payload.type ?? "");
  if (type !== "post_call_transcription" && type !== "post_call_audio") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const conversationId = String(data.conversation_id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const durationSec = Number(metadata.call_duration_secs) || 0;

  const rawTranscript = data.transcript;
  let transcript: TranscriptEntry[] = [];
  if (Array.isArray(rawTranscript)) {
    transcript = rawTranscript
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .filter(t => String(t.message ?? t.text ?? "").trim())
      .map(t => ({
        role: t.role === "user" ? ("user" as const) : ("agent" as const),
        text: String(t.message ?? t.text ?? "").trim(),
        time_sec: Number(t.time_in_call_secs ?? t.timestamp) || 0,
      }));
  } else if (rawTranscript && typeof rawTranscript === "object") {
    const turns = (rawTranscript as { turns?: unknown[] }).turns ?? [];
    transcript = turns
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map(t => ({
        role: t.speaker === "user" ? ("user" as const) : ("agent" as const),
        text: String(t.text ?? "").trim(),
        time_sec: 0,
      }))
      .filter(t => t.text);
  }

  try {
    await finalizeElevenLabsPremiumCall({
      conversationId,
      durationSec: durationSec || undefined,
      transcript: transcript.length ? transcript : undefined,
      disconnectReason: String(data.status ?? "post_call_webhook"),
    });
  } catch (err) {
    console.error("[elevenlabs-webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
