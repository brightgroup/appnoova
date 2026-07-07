import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { buildFallbackSummary } from "@/lib/voice-call-utils";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export interface CallAnalysisResult {
  summary: string;
  user_sentiment: string;
  extracted_data: Record<string, unknown>;
}

const SENTIMENTS = ["Positivo", "Neutral", "Negativo"] as const;

function extractNestedObject(text: string, key: string): Record<string, unknown> | null {
  const marker = `"${key}"`;
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const start = text.indexOf("{", idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function salvagePartialJson(text: string): Partial<CallAnalysisResult> | null {
  const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sentimentMatch = text.match(/"user_sentiment"\s*:\s*"(Positivo|Neutral|Negativo)"/);
  if (!summaryMatch) return null;

  const extracted = extractNestedObject(text, "extracted_data") ?? {};

  return {
    summary: summaryMatch[1].replace(/\\"/g, '"'),
    user_sentiment: sentimentMatch?.[1] ?? "Neutral",
    extracted_data: extracted
  };
}

function parseAnalysisJson(text: string): Partial<CallAnalysisResult> | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Partial<CallAnalysisResult>;
  } catch {
    return salvagePartialJson(cleaned);
  }
}

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

/** Análisis post-llamada con Gemini Flash (económico, solo texto/transcripción). */
export async function analyzeCallTranscript(
  transcript: TranscriptEntry[]
): Promise<CallAnalysisResult> {
  const fallback: CallAnalysisResult = {
    summary: buildFallbackSummary(transcript),
    user_sentiment: "Neutral",
    extracted_data: buildFallbackExtractedData(transcript)
  };

  if (!transcript.length) return fallback;

  const apiKey = getOriApiKey();
  if (!apiKey) return fallback;

  const dialogue = transcript
    .map(t => `[${t.time_sec}s] ${t.role === "user" ? "Usuario" : "Agente"}: ${t.text}`)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: getOriModel(),
      contents: [{
        role: "user",
        parts: [{
          text: `Analiza esta llamada de un agente de voz comercial (español colombiano).
Responde SOLO JSON válido, sin markdown. El campo extracted_data es obligatorio y no puede ir vacío.
Enfócate en el resultado comercial. Si hubo problemas de comunicación pero también conversación de negocio, el resumen debe priorizar el negocio.
{
  "summary": "2-3 oraciones claras sobre el motivo de la llamada y el resultado comercial",
  "user_sentiment": "Positivo|Neutral|Negativo",
  "extracted_data": {
    "intencion_usuario": "qué buscaba o necesitaba el usuario",
    "resultado_llamada": "cómo terminó la llamada",
    "datos_clave": ["dato1", "dato2"],
    "proximos_pasos": "acción sugerida",
    "objeciones": "objeciones del usuario o vacío"
  }
}

Transcripción:
${dialogue}`
        }]
      }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json"
      }
    });

    const raw = res.text?.trim() ?? "";
    const parsed = parseAnalysisJson(raw);
    if (!parsed?.summary) return fallback;

    const sentiment = SENTIMENTS.includes(parsed.user_sentiment as typeof SENTIMENTS[number])
      ? parsed.user_sentiment!
      : "Neutral";

    const extractedFromNested = extractNestedObject(raw, "extracted_data");
    const extractedRaw = parsed.extracted_data ?? extractedFromNested;

    return {
      summary: parsed.summary,
      user_sentiment: sentiment,
      extracted_data: normalizeExtractedData(extractedRaw, transcript)
    };
  } catch (err) {
    console.error("[call-analysis] error:", err);
    return fallback;
  }
}
