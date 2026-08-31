import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichCrmContactFromWhatsAppConversation } from "@/lib/crm-contact-enrich";
import { enrichCrmLeadForConversationId } from "@/lib/crm-lead-enrich";

/**
 * Antes, cada mensaje entrante disparaba 2 llamadas a Gemini (ficha de contacto +
 * pipeline de leads), cada una reenviando la conversación completa — en una ráfaga
 * típica de WhatsApp (varios mensajes seguidos, ej. cliente mandando fotos de
 * productos) eso eran 10+ llamadas por minuto para la misma conversación. Este
 * cooldown agrupa esas ráfagas en una sola corrida: si ya se enriqueció hace poco,
 * se espera al próximo mensaje después de la ventana. No se pierde información —
 * esa próxima corrida igual manda la transcripción completa actualizada.
 */
const AUTO_ENRICH_COOLDOWN_MS = 5 * 60 * 1000;

interface AutoEnrichGate {
  last_run_at?: string;
}

/**
 * Mensajes que casi nunca traen un dato nuevo de contacto/etapa — no vale la
 * pena gastar un llamado completo a la IA solo para confirmar que no cambió
 * nada. Lista corta y conservadora a propósito: ante la duda, se analiza.
 */
const LOW_SIGNAL_MESSAGES = new Set([
  "ok", "okay", "oki", "listo", "vale", "dale", "bueno", "bien",
  "si", "sí", "no", "gracias", "muchas gracias", "perfecto", "genial",
  "excelente", "entendido", "de acuerdo", "claro", "ya", "aja", "ajá"
]);

function isLowSignalMessage(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[¡!¿?.,;:]/g, "")
    .trim();
  if (!normalized) return true;
  if (normalized.length <= 2) return true;
  return LOW_SIGNAL_MESSAGES.has(normalized);
}

export interface AutoEnrichTrigger {
  text: string;
  hasMedia: boolean;
}

/**
 * Punto de entrada único del enriquecimiento automático post-mensaje (ficha +
 * pipeline). Reemplaza los dos `void enrich...()` sueltos que había en cada
 * llamador — así el cooldown aplica sin importar si el mensaje lo procesó el
 * bot o lo mandó un agente humano desde el inbox.
 *
 * `trigger` es opcional (el call site del inbox humano no tiene un mensaje
 * entrante nuevo que evaluar) — cuando viene, un mensaje sin media y sin
 * texto útil ("ok", "gracias", un emoji suelto) se salta antes de tocar la
 * base de datos siquiera, ni cuenta para el cooldown.
 */
export async function runAutoCrmEnrichment(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  conversationId: string,
  trigger?: AutoEnrichTrigger
): Promise<void> {
  if (trigger && !trigger.hasMedia && isLowSignalMessage(trigger.text)) return;

  const { data: conv } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const meta = (conv?.metadata as Record<string, unknown>) ?? {};
  const gate = meta.auto_enrich_gate as AutoEnrichGate | undefined;
  if (gate?.last_run_at && Date.now() - new Date(gate.last_run_at).getTime() < AUTO_ENRICH_COOLDOWN_MS) {
    return;
  }

  // Se marca ANTES de llamar a Gemini (no después) para que una ráfaga de
  // mensajes que llegan casi juntos no dispare varias corridas en paralelo
  // mientras la primera todavía no terminó de escribir su resultado.
  await db
    .from("text_agent_conversations")
    .update({
      metadata: { ...meta, auto_enrich_gate: { last_run_at: new Date().toISOString() } satisfies AutoEnrichGate }
    })
    .eq("id", conversationId)
    .eq("user_id", userId);

  await Promise.all([
    enrichCrmContactFromWhatsAppConversation(db, userId, contactId, conversationId).catch(err =>
      console.error("[crm/auto-enrich] contact:", err)
    ),
    enrichCrmLeadForConversationId(db, userId, conversationId).catch(err =>
      console.error("[crm/auto-enrich] lead:", err)
    )
  ]);
}
