import { buildFallbackSummary } from "@/lib/voice-call-utils";
import type { GeminiUsage } from "@/lib/billing/meter";
import { runInternalJsonPrompt } from "@/lib/llm/internal-json-prompt";
import type { TranscriptEntry } from "@/types/voice-agent-call";

const EMPTY_USAGE: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

export interface CallAnalysisResult {
  summary: string;
  user_sentiment: string;
  extracted_data: Record<string, unknown>;
  usage: GeminiUsage;
}

const SENTIMENTS = ["Positivo", "Neutral", "Negativo"] as const;

function hasExtractedData(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    return String(v ?? "").trim().length > 0;
  });
}

function buildFallbackExtractedData(transcript: TranscriptEntry[]): Record<string, unknown> {
  const userLines = transcript.filter(t => t.role === "user").map(t => t.text.trim()).filter(Boolean);
  const agentLines = transcript.filter(t => t.role === "agent").map(t => t.text.trim()).filter(Boolean);
  const lastUser = userLines[userLines.length - 1] ?? "";
  const lastAgent = agentLines[agentLines.length - 1] ?? "";

  return {
    intencion_usuario: lastUser.slice(0, 200) || "No identificada en la transcripción",
    resultado_llamada: transcript.length >= 2
      ? "Conversación registrada — revisar transcripción para detalle"
      : "Sin datos suficientes",
    datos_clave: userLines.slice(0, 4).map(t => t.slice(0, 120)),
    proximos_pasos: lastAgent
      ? `Última respuesta del agente: ${lastAgent.slice(0, 160)}`
      : "Seguimiento según política del agente",
    objeciones: ""
  };
}

function normalizeExtractedData(raw: unknown, transcript: TranscriptEntry[]): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const data = raw as Record<string, unknown>;
    if (hasExtractedData(data)) return data;
  }
  return buildFallbackExtractedData(transcript);
}

/** Análisis post-llamada (solo texto/transcripción) — motor con failover, ver runInternalJsonPrompt. */
export async function analyzeCallTranscript(
  transcript: TranscriptEntry[]
): Promise<CallAnalysisResult> {
  const fallback: CallAnalysisResult = {
    summary: buildFallbackSummary(transcript),
    user_sentiment: "Neutral",
    extracted_data: buildFallbackExtractedData(transcript),
    usage: EMPTY_USAGE
  };

  if (!transcript.length) return fallback;

  const dialogue = transcript
    .map(t => `[${t.time_sec}s] ${t.role === "user" ? "Usuario" : "Agente"}: ${t.text}`)
    .join("\n");

  const system = `Analiza esta llamada de un agente de voz comercial (español colombiano).
Responde SOLO JSON válido con forma: { "summary": "...", "user_sentiment": "Positivo|Neutral|Negativo", "extracted_data": {...} }
El campo extracted_data es obligatorio y no puede ir vacío.
Enfócate en el resultado comercial. Si hubo problemas de comunicación pero también conversación de negocio, el resumen debe priorizar el negocio.
extracted_data debe tener: intencion_usuario, resultado_llamada, datos_clave (array), proximos_pasos, objeciones.`;

  try {
    const { result: parsed, usage } = await runInternalJsonPrompt<Partial<CallAnalysisResult>>(
      system,
      `Transcripción:\n${dialogue}`,
      1024
    );
    if (!parsed?.summary) return fallback;

    const sentiment = SENTIMENTS.includes(parsed.user_sentiment as typeof SENTIMENTS[number])
      ? parsed.user_sentiment!
      : "Neutral";

    return {
      summary: parsed.summary,
      user_sentiment: sentiment,
      extracted_data: normalizeExtractedData(parsed.extracted_data, transcript),
      usage
    };
  } catch (err) {
    console.error("[call-analysis] error:", err);
    return fallback;
  }
}
