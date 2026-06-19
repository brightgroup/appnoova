import { GoogleGenAI } from "@google/genai";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { buildChatFallbackSummary } from "@/lib/text-chat-utils";
import type { TextChatMessage } from "@/types/text-agent-conversation";

export interface ChatAnalysisResult {
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

function salvagePartialJson(text: string): Partial<ChatAnalysisResult> | null {
  const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sentimentMatch = text.match(/"user_sentiment"\s*:\s*"(Positivo|Neutral|Negativo)"/);
  if (!summaryMatch) return null;

  return {
    summary: summaryMatch[1].replace(/\\"/g, '"'),
    user_sentiment: sentimentMatch?.[1] ?? "Neutral",
    extracted_data: extractNestedObject(text, "extracted_data") ?? {}
  };
}

function parseAnalysisJson(text: string): Partial<ChatAnalysisResult> | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Partial<ChatAnalysisResult>;
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

function buildFallbackExtractedData(messages: TextChatMessage[]): Record<string, unknown> {
  const userLines = messages.filter(m => m.role === "user").map(m => m.content.trim()).filter(Boolean);
  const agentLines = messages.filter(m => m.role === "assistant").map(m => m.content.trim()).filter(Boolean);
  const lastUser = userLines[userLines.length - 1] ?? "";
  const lastAgent = agentLines[agentLines.length - 1] ?? "";

  return {
    intencion_usuario: lastUser.slice(0, 200) || "No identificada en la conversación",
    resultado_chat: messages.length >= 2
      ? "Conversación registrada — revisar mensajes para detalle"
      : "Sin datos suficientes",
    datos_clave: userLines.slice(0, 4).map(t => t.slice(0, 120)),
    proximos_pasos: lastAgent
      ? `Última respuesta del agente: ${lastAgent.slice(0, 160)}`
      : "Seguimiento según política del agente",
    objeciones: ""
  };
}

function normalizeExtractedData(raw: unknown, messages: TextChatMessage[]): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const data = raw as Record<string, unknown>;
    if (hasExtractedData(data)) return data;
  }
  return buildFallbackExtractedData(messages);
}

/** Análisis post-chat con Gemini (resumen, sentimiento y datos extraídos). */
export async function analyzeChatConversation(
  messages: TextChatMessage[]
): Promise<ChatAnalysisResult> {
  const fallback: ChatAnalysisResult = {
    summary: buildChatFallbackSummary(messages),
    user_sentiment: "Neutral",
    extracted_data: buildFallbackExtractedData(messages)
  };

  if (messages.length < 2) return fallback;

  const apiKey = getOriApiKey();
  if (!apiKey) return fallback;

  const dialogue = messages
    .map(m => `${m.role === "user" ? "Usuario" : "Agente"}: ${m.content}`)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: getOriModel(),
      contents: [{
        role: "user",
        parts: [{
          text: `Analiza esta conversación de chat de un agente comercial (español colombiano).
Responde SOLO JSON válido, sin markdown. El campo extracted_data es obligatorio y no puede ir vacío.
{
  "summary": "2-3 oraciones claras sobre qué pasó y el resultado",
  "user_sentiment": "Positivo|Neutral|Negativo",
  "extracted_data": {
    "intencion_usuario": "qué buscaba o necesitaba el usuario",
    "resultado_chat": "cómo terminó la conversación",
    "datos_clave": ["dato1", "dato2"],
    "proximos_pasos": "acción sugerida",
    "objeciones": "objeciones del usuario o vacío"
  }
}

Conversación:
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

    const extractedRaw = parsed.extracted_data ?? extractNestedObject(raw, "extracted_data");

    return {
      summary: parsed.summary,
      user_sentiment: sentiment,
      extracted_data: normalizeExtractedData(extractedRaw, messages)
    };
  } catch (err) {
    console.error("[text-chat-analysis] error:", err);
    return fallback;
  }
}

export function needsChatAnalysis(
  conv: { summary?: string; extracted_data?: Record<string, unknown>; metadata?: Record<string, unknown> },
  messages: TextChatMessage[]
): boolean {
  if (messages.length < 2) return false;
  if (conv.metadata?.analyzed_at) return false;
  if (hasExtractedData(conv.extracted_data)) return false;
  const summary = String(conv.summary ?? "").trim();
  if (!summary) return true;
  return summary === buildChatFallbackSummary(messages);
}
