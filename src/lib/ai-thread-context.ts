import type { SupabaseClient } from "@supabase/supabase-js";
import { runInternalJsonPrompt } from "@/lib/llm/internal-json-prompt";

/**
 * Contexto que se le manda al agente en cada turno. Un LLM no recuerda nada entre
 * llamadas: para que "siga el hilo" hay que reenviarle la conversación entera cada
 * vez. Este módulo hace dos cosas con ese reenvío, y es independiente del motor
 * (Gemini / OpenAI / Claude) — se arma una sola vez y cada proveedor lo adapta.
 *
 * 1. Incluye los turnos del asesor humano (`role: "human"`), etiquetados. Antes se
 *    filtraban y la IA retomaba la conversación sin saber qué había hablado el
 *    asesor, así que repetía preguntas ya contestadas.
 * 2. Mantiene una ventana de los últimos N mensajes literales y resume en una nota
 *    rodante todo lo anterior. Sin esto el hilo crece sin techo y se reenvía
 *    completo en cada mensaje (hay conversaciones reales de 7.000+ tokens por turno).
 */

/** Mensajes recientes que siempre viajan literales, sin resumir. */
export const AI_CONTEXT_WINDOW = 20;

/**
 * Cuántos mensajes nuevos deben caer fuera de la ventana antes de volver a resumir.
 * Sin este margen habría una llamada de resumen en cada turno; con él, la ventana
 * real oscila entre 20 y 30 mensajes y se resume una vez cada 10.
 */
export const AI_CONTEXT_REFRESH_EVERY = 10;

/** Clave dentro de `metadata` de la conversación. */
export const AI_CONTEXT_SUMMARY_KEY = "ai_context_summary";

export interface ThreadContextSummary {
  text: string;
  /** Cuántos mensajes del principio del hilo ya están cubiertos por este resumen. */
  covered: number;
  updated_at: string;
}

/**
 * Lo mínimo que hace falta de un mensaje para armar el contexto. Se deja laxo a
 * propósito: por WhatsApp llegan los mensajes completos desde la base, y por el
 * micrositio llega el hilo del widget, que no trae `created_at`.
 */
export interface ThreadMessageLike {
  role: string;
  content: string;
  internal_content?: string | null;
}

export interface AgentThreadMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentThreadContext {
  /** Lo que se le manda al modelo como historial. */
  messages: AgentThreadMessage[];
  /** Bloque para anteponer al system prompt (resumen + reglas). Null si no hace falta. */
  contextBlock: string | null;
  /** Si no es null, hay que resumir `messages[0..upto)` y guardar la nota. */
  summarizeUpto: number | null;
}

export function readThreadContextSummary(metadata: unknown): ThreadContextSummary | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[AI_CONTEXT_SUMMARY_KEY];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  const covered = Number(obj.covered);
  if (!text || !Number.isFinite(covered) || covered < 0) return null;
  return {
    text,
    covered: Math.floor(covered),
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : ""
  };
}

/** El visitante puede traer una versión "para la IA" del mensaje (transcripción, OCR…). */
function contentForAi(msg: ThreadMessageLike): string {
  if (msg.role === "user" && msg.internal_content?.trim()) return msg.internal_content.trim();
  return msg.content;
}

/**
 * Los mensajes del asesor van como `assistant` (son del lado del negocio, no del
 * cliente) pero etiquetados: si fueran como `user`, el modelo creería que eso lo
 * dijo el cliente y respondería a su propio equipo.
 */
export function toAgentThreadMessage(msg: ThreadMessageLike): AgentThreadMessage | null {
  const content = contentForAi(msg).trim();
  if (!content) return null;
  if (msg.role === "human") return { role: "assistant", content: `[Asesor humano] ${content}` };
  if (msg.role === "assistant") return { role: "assistant", content };
  if (msg.role === "user") return { role: "user", content };
  return null;
}

function hasHumanTurns(messages: ThreadMessageLike[]): boolean {
  return messages.some(m => m.role === "human");
}

const HUMAN_RULES = [
  'Un asesor humano del equipo ya participó en esta conversación. Sus mensajes aparecen marcados como "[Asesor humano]".',
  "No vuelvas a pedir datos que el cliente ya dio ni que el asesor ya recogió.",
  "No contradigas ni reemplaces nada que el asesor haya prometido, cotizado o acordado.",
  "Si el asesor dejó algo a su cargo, no lo asumas tú: menciónalo como pendiente con él."
].join(" ");

function buildContextBlock(summary: string | null, humanInvolved: boolean): string | null {
  if (!summary && !humanInvolved) return null;
  const parts = ["=== CONTEXTO DE ESTA CONVERSACIÓN (no es un mensaje del cliente) ==="];
  if (summary) {
    parts.push(`Resumen de lo hablado antes de los últimos mensajes:\n${summary}`);
  }
  if (humanInvolved) parts.push(HUMAN_RULES);
  parts.push("=== FIN DEL CONTEXTO ===");
  return parts.join("\n\n");
}

/**
 * Arma el historial del turno. Nunca descarta un mensaje que no esté cubierto por
 * el resumen: si todavía no hay nota (o falló al generarse), manda el hilo completo
 * igual que antes, y deja pedido el resumen para que el turno siguiente ya sea barato.
 */
export function buildAgentThreadContext(
  allMessages: ThreadMessageLike[],
  summary: ThreadContextSummary | null
): AgentThreadContext {
  const total = allMessages.length;
  const covered = summary ? Math.min(summary.covered, total) : 0;
  const targetCovered = Math.max(0, total - AI_CONTEXT_WINDOW);
  const summarizeUpto =
    targetCovered - covered >= AI_CONTEXT_REFRESH_EVERY ? targetCovered : null;

  const kept = allMessages.slice(covered);
  const messages = kept.map(toAgentThreadMessage).filter((m): m is AgentThreadMessage => m !== null);

  return {
    messages,
    // Las reglas del asesor se miran sobre el hilo completo: si sus mensajes ya
    // quedaron dentro del resumen, la regla sigue haciendo falta.
    contextBlock: buildContextBlock(summary?.text ?? null, hasHumanTurns(allMessages)),
    summarizeUpto
  };
}

const SUMMARY_SYSTEM = [
  "Eres un asistente interno que mantiene la memoria de una conversación de atención al cliente.",
  "Recibes el resumen previo (si existe) y los mensajes que acaban de salir de la ventana reciente.",
  "Devuelve un resumen ACTUALIZADO que reemplace al anterior, en español, máximo 120 palabras.",
  "Incluye solo lo que sirve para seguir atendiendo: datos confirmados del cliente (nombre, documento, producto, placa, montos), qué pidió, qué se le prometió o cotizó, qué hizo el asesor humano si intervino, y qué quedó pendiente.",
  "No inventes nada, no opines y no saludes. Si un dato no aparece, omítelo.",
  'Responde SOLO con JSON: {"resumen": "..."}'
].join(" ");

function formatForSummary(messages: ThreadMessageLike[]): string {
  return messages
    .map(m => {
      const who = m.role === "user" ? "Cliente" : m.role === "human" ? "Asesor humano" : "Asistente";
      const text = contentForAi(m).replace(/\s+/g, " ").trim();
      return text ? `${who}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Resume `messages[summary.covered .. upto)` y lo funde con la nota previa. Cada
 * mensaje se lee una sola vez en toda la vida de la conversación: el prefijo ya
 * resumido nunca se vuelve a mandar al modelo, solo su resumen.
 */
export async function buildRollingSummary(
  allMessages: ThreadMessageLike[],
  previous: ThreadContextSummary | null,
  upto: number
): Promise<ThreadContextSummary | null> {
  const from = previous ? Math.min(previous.covered, upto) : 0;
  const chunk = allMessages.slice(from, upto);
  if (!chunk.length) return null;

  const transcript = formatForSummary(chunk);
  if (!transcript.trim()) return null;

  const prompt = [
    previous?.text ? `RESUMEN PREVIO:\n${previous.text}` : "RESUMEN PREVIO: (ninguno, es la primera vez)",
    `\nMENSAJES NUEVOS A INCORPORAR:\n${transcript}`
  ].join("\n");

  try {
    const { result } = await runInternalJsonPrompt<{ resumen?: string }>(SUMMARY_SYSTEM, prompt, 400);
    const text = String(result?.resumen ?? "").trim();
    if (!text) return null;
    return { text, covered: upto, updated_at: new Date().toISOString() };
  } catch (err) {
    // Un resumen que falla no puede romper la respuesta al cliente: se reintenta
    // en el turno siguiente y mientras tanto el hilo viaja completo, como antes.
    console.warn("[ai-thread-context] resumen rodante:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Guarda la nota en `metadata` sin pisar el resto de las claves. */
export async function persistThreadContextSummary(
  db: SupabaseClient,
  conversationId: string,
  userId: string,
  summary: ThreadContextSummary
): Promise<void> {
  try {
    const { data } = await db
      .from("text_agent_conversations")
      .select("metadata")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    const base =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};

    await db
      .from("text_agent_conversations")
      .update({ metadata: { ...base, [AI_CONTEXT_SUMMARY_KEY]: summary } })
      .eq("id", conversationId)
      .eq("user_id", userId);
  } catch (err) {
    console.warn("[ai-thread-context] guardar resumen:", err instanceof Error ? err.message : err);
  }
}
