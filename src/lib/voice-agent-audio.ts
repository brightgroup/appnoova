import { resolveBaseTemplateId } from "@/lib/voice-agent-templates";
import type { VoiceAgentFormData } from "@/types/voice-agent";

/** Asegura que los sliders reciban números válidos desde Supabase/JSON. */
export function normalizeVoiceAgentForm(
  raw: Partial<VoiceAgentFormData> & { template_id?: string; source_template?: string }
): VoiceAgentFormData {
  const source = raw.source_template || resolveBaseTemplateId(raw.template_id ?? "lead-qualification");
  return {
    source_template: source,
    name: raw.name ?? "",
    prompt: raw.prompt ?? "",
    voice_name: raw.voice_name ?? "Aoede",
    model: raw.model ?? "gemini-2.5-flash-native-audio-preview-12-2025",
    voice_speed: clamp(Number(raw.voice_speed) || 1, 0.5, 1.5),
    temperature: clamp(Number(raw.temperature) ?? 1, 0, 2),
    volume: clamp(Number(raw.volume) || 1, 0, 2),
    llm_model: raw.llm_model ?? raw.model ?? "gemini-2.5-flash-native-audio-preview-12-2025",
    color: raw.color ?? null
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Temperatura válida para Gemini Live (evita 0 exacto). */
export function geminiTemperature(t: number): number {
  return clamp(t, 0.1, 2);
}
