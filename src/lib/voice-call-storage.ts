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

const RECORDING_SIGNED_URL_TTL_SEC = 3600;

/** Ruta dentro del bucket a partir de la URL guardada en `audio_url` (pública antigua o firmada). */
function recordingPathFromUrl(url: string): string | null {
  const marker = `/${VOICE_RECORDINGS_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

/**
 * El bucket de grabaciones es privado: reemplaza `audio_url` de cada fila por
 * una URL firmada de corta duración antes de devolverla al navegador.
 */
export async function withSignedRecordingUrls<T extends { audio_url?: string | null }>(
  db: SupabaseClient,
  rows: T[]
): Promise<T[]> {
  const paths = rows
    .map(r => (r.audio_url ? recordingPathFromUrl(r.audio_url) : null))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return rows;

  const { data, error } = await db.storage
    .from(VOICE_RECORDINGS_BUCKET)
    .createSignedUrls([...new Set(paths)], RECORDING_SIGNED_URL_TTL_SEC);
  if (error || !data) {
    console.error("[storage] no se pudieron firmar grabaciones:", error?.message);
    return rows.map(r => ({ ...r, audio_url: null }));
  }
  const signed = new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  return rows.map(r => {
    const path = r.audio_url ? recordingPathFromUrl(r.audio_url) : null;
    return path ? { ...r, audio_url: signed.get(path) ?? null } : r;
  });
}
