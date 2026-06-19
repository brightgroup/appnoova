import { creditsForVoiceDuration } from "@/lib/billing/pricing";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function callQualityPercent(call: {
  duration_sec: number;
  user_sentiment: string;
  audio_url?: string | null;
}): number {
  let score = 65;
  if (call.duration_sec >= 20) score += 10;
  if (call.duration_sec >= 45) score += 5;
  if (call.user_sentiment === "Positivo") score += 15;
  if (call.user_sentiment === "Negativo") score -= 20;
  if (call.audio_url) score += 10;
  return Math.min(100, Math.max(30, score));
}

export function formatCallDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).replace(",", "");
}

export function formatCallTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

export function formatTranscriptTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function estimateCallCredits(durationSec: number): number {
  return creditsForVoiceDuration(durationSec);
}

export function displayCallId(id: string): string {
  return `call_${id}`;
}

export function buildFallbackSummary(transcript: TranscriptEntry[]): string {
  if (!transcript.length) return "Llamada sin transcripción disponible.";
  const joined = transcript.map(t => `${t.role === "user" ? "Usuario" : "Agente"}: ${t.text}`).join(" ");
  if (joined.length <= 320) return joined;
  return `${joined.slice(0, 317)}...`;
}

export function downloadCallJson(call: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(call, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function audioExtensionFromUrl(url: string): string {
  if (/\.wav(\?|$)/i.test(url)) return "wav";
  if (/\.ogg(\?|$)/i.test(url)) return "ogg";
  if (/\.mp3|\.mpeg(\?|$)/i.test(url)) return "mp3";
  if (/\.mp4|\.m4a(\?|$)/i.test(url)) return "m4a";
  return "webm";
}

export async function downloadCallAudio(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
