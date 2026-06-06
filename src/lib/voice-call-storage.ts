import type { SupabaseClient } from "@supabase/supabase-js";

export const VOICE_RECORDINGS_BUCKET = "voice-call-recordings";

export function callRecordingPath(userId: string, callId: string, ext = "webm"): string {
  return `${userId}/${callId}.${ext}`;
}

export function publicRecordingUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${VOICE_RECORDINGS_BUCKET}/${path}`;
}

export async function uploadCallRecording(
  db: SupabaseClient,
  userId: string,
  callId: string,
  audio: Blob | Buffer,
  contentType: string
): Promise<string | null> {
  const ext = contentType.includes("webm") ? "webm"
    : contentType.includes("wav") ? "wav"
    : contentType.includes("ogg") ? "ogg"
    : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a"
    : contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3"
    : "wav";
  const path = callRecordingPath(userId, callId, ext);

  const { error } = await db.storage
    .from(VOICE_RECORDINGS_BUCKET)
    .upload(path, audio, { contentType, upsert: true });

  if (error) {
    console.error("[storage] upload error:", error.message);
    return null;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return publicRecordingUrl(base, path);
}
