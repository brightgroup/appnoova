import { buildChatFallbackSummary, hasExtractedData } from "@/lib/text-chat-utils";
import type { GeminiUsage } from "@/lib/billing/meter";
import { runInternalJsonPrompt } from "@/lib/llm/internal-json-prompt";
import type { TextChatMessage } from "@/types/text-agent-conversation";

const EMPTY_USAGE: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

export interface ChatAnalysisResult {
  summary: string;
  user_sentiment: string;
  extracted_data: Record<string, unknown>;
  usage: GeminiUsage;
}

const SENTIMENTS = ["Positivo", "Neutral", "Negativo"] as const;

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

/** Análisis post-chat (resumen, sentimiento y datos extraídos) — motor con failover, ver runInternalJsonPrompt. */
export async function analyzeChatConversation(
  messages: TextChatMessage[]
): Promise<ChatAnalysisResult> {
  const fallback: ChatAnalysisResult = {
    summary: buildChatFallbackSummary(messages),
    user_sentiment: "Neutral",
    extracted_data: buildFallbackExtractedData(messages),
    usage: EMPTY_USAGE
  };

  if (messages.length < 2) return fallback;

  const dialogue = messages
    .map(m => `${m.role === "user" ? "Usuario" : "Agente"}: ${m.content}`)
    .join("\n");

  const system = `Analiza esta conversación de chat de un agente comercial (español colombiano).
Responde SOLO JSON válido con forma: { "summary": "...", "user_sentiment": "Positivo|Neutral|Negativo", "extracted_data": {...} }
El campo extracted_data es obligatorio y no puede ir vacío.
extracted_data debe tener: intencion_usuario, resultado_chat, datos_clave (array), proximos_pasos, objeciones.`;

  try {
    const { result: parsed, usage } = await runInternalJsonPrompt<Partial<ChatAnalysisResult>>(
      system,
      `Conversación:\n${dialogue}`,
      1024
    );
    if (!parsed?.summary) return fallback;

    const sentiment = SENTIMENTS.includes(parsed.user_sentiment as typeof SENTIMENTS[number])
      ? parsed.user_sentiment!
      : "Neutral";

    return {
      summary: parsed.summary,
      user_sentiment: sentiment,
      extracted_data: normalizeExtractedData(parsed.extracted_data, messages),
      usage
    };
  } catch (err) {
    console.error("[text-chat-analysis] error:", err);
    return fallback;
  }
}
