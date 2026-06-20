import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { ELEVENLABS_API_BASE, requireElevenLabsApiKey } from "@/lib/elevenlabs/config";
import {
  CURATED_PREMIUM_VOICES,
  type CuratedPremiumVoice,
} from "@/lib/elevenlabs/default-voices";

export interface PremiumVoiceOption {
  id: string;
  label: string;
  region: CuratedPremiumVoice["region"];
}

const REGION_ORDER: Record<CuratedPremiumVoice["region"], number> = {
  colombia: 0,
  mexico: 1,
  spain: 2,
  english: 3,
};

/** Solo voces curadas para el wizard — Colombia primero. */
export async function listCuratedPremiumVoices(): Promise<PremiumVoiceOption[]> {
  let availableIds = new Set<string>();

  try {
    const data = await elevenLabsFetch<{
      voices?: { voice_id: string }[];
    }>("/voices");
    availableIds = new Set((data.voices ?? []).map(v => v.voice_id).filter(Boolean));
  } catch {
    return CURATED_PREMIUM_VOICES.map(v => ({
      id: v.id,
      label: v.label,
      region: v.region,
    }));
  }

  return CURATED_PREMIUM_VOICES
    .filter(v => availableIds.has(v.id))
    .sort((a, b) => REGION_ORDER[a.region] - REGION_ORDER[b.region])
    .map(v => ({ id: v.id, label: v.label, region: v.region }));
}

export async function getElevenLabsConversationAudio(
  conversationId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = requireElevenLabsApiKey();
  const res = await fetch(
    `${ELEVENLABS_API_BASE}/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
    { headers: { "xi-api-key": apiKey } }
  );
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "audio/mpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) return null;
  return { buffer, contentType };
}

/** Espera a que ElevenLabs procese la conversación tras colgar. */
export async function waitForElevenLabsConversationReady(
  conversationId: string,
  opts?: { maxAttempts?: number; delayMs?: number }
): Promise<boolean> {
  const maxAttempts = opts?.maxAttempts ?? 8;
  const delayMs = opts?.delayMs ?? 750;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = await elevenLabsFetch<{ status?: string }>(
        `/convai/conversations/${encodeURIComponent(conversationId)}`
      );
      const status = String(data.status ?? "");
      if (status === "done" || status === "failed" || status === "processing") {
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}
