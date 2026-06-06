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

function salvagePartialJson(text: string): Partial<CallAnalysisResult> | null {
  const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sentimentMatch = text.match(/"user_sentiment"\s*:\s*"(Positivo|Neutral|Negativo)"/);
  if (!summaryMatch) return null;
  return {
    summary: summaryMatch[1].replace(/\\"/g, '"'),
    user_sentiment: sentimentMatch?.[1] ?? "Neutral",
    extracted_data: {}
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

/** Análisis post-llamada con Gemini Flash (económico, solo texto/transcripción). */
export async function analyzeCallTranscript(
  transcript: TranscriptEntry[]
): Promise<CallAnalysisResult> {
  const fallback: CallAnalysisResult = {
    summary: buildFallbackSummary(transcript),
    user_sentiment: "Neutral",
    extracted_data: {}
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
          text: `Analiza esta llamada de un agente de seguros (español colombiano).
Responde SOLO JSON válido, sin markdown, máximo 120 palabras en summary:
{
  "summary": "2-3 oraciones claras sobre qué pasó y el resultado",
  "user_sentiment": "Positivo|Neutral|Negativo",
  "extracted_data": {
    "intencion_usuario": "texto breve",
    "resultado_llamada": "texto breve",
    "datos_clave": ["punto1", "punto2"],
    "proximos_pasos": "texto breve",
    "objeciones": "texto breve o vacío"
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

    return {
      summary: parsed.summary,
      user_sentiment: sentiment,
      extracted_data: (parsed.extracted_data as Record<string, unknown>) ?? {}
    };
  } catch (err) {
    console.error("[call-analysis] error:", err);
    return fallback;
  }
}
