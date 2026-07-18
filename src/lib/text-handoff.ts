import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrgHandoff, channelLabel, type HandoffNotifyContext } from "@/lib/email/notify-handoff";
import { notifyPushForOrg } from "@/lib/push/send";

/** Mensaje al visitante al pasar a cola humana (sin nombre de asesor). */
export const HANDOFF_VISITOR_REPLY =
  "Con gusto. Te paso con un asesor de nuestro equipo; en un momento te atienden por este mismo chat.";

const USER_HANDOFF_PATTERNS: RegExp[] = [
  /\b(quiero|necesito|deseo|prefiero)\b[\s\S]{0,48}\b(hablar|atenci[oó]n|comunicarme|contactar)\b[\s\S]{0,40}\b(humano|asesor|persona|alguien|agente)\b/i,
  /\bhablar\s+con\s+(un\s+|una\s+)?(humano|asesor|persona|alguien)\b/i,
  /\b(p[aá]same|p[aá]senme|transfieren?me|transferirme|derivarme|conectarme)\b[\s\S]{0,36}\b(asesor|humano|persona)\b/i,
  /\bno\s+(quiero|me\s+sirve)\b[\s\S]{0,36}\b(bot|robot|ia|inteligencia)\b/i,
  /\b(atenci[oó]n)\s+(humana|personalizada)\b/i,
  /\b(asesor|humano|persona\s+real)\b[\s\S]{0,20}\b(por\s+favor|please)\b/i,
  /\b(operador|representante)\b/i
];

const ASSISTANT_HANDOFF_PATTERNS: RegExp[] = [
  /\b(te\s+paso|te\s+transfiero|voy\s+a\s+(transferir|pasar|derivar)|te\s+derivo)\b/i,
  /\b(un\s+asesor|nuestro\s+equipo|una\s+persona)\b[\s\S]{0,48}\b(te\s+(atender|contactar|responder)|tomar[aá]\s+el\s+chat)\b/i,
  /\b(quedo|quedas?)\s+en\s+(manos|espera)\b/i,
  /\ben\s+un\s+momento\s+te\s+atienden?\b/i
];

export function detectUserHandoffIntent(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 800) return false;
  return USER_HANDOFF_PATTERNS.some(p => p.test(t));
}

export function detectAssistantHandoffOffer(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return ASSISTANT_HANDOFF_PATTERNS.some(p => p.test(t));
}

function asMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export interface EscalateHandoffInput {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  organizationId: string | null;
  reason: HandoffNotifyContext["reason"];
  channel: string;
  agentName?: string | null;
  contactLabel?: string | null;
  visitorMessage?: string | null;
}

/**
 * Marca la conversación en modo humano sin asignar a nadie,
 * y notifica por email al equipo de la org (una sola vez).
 */
export async function escalateConversationToHuman(
  input: EscalateHandoffInput
): Promise<{ escalated: boolean; emailSent: boolean }> {
  const { data: row, error } = await input.db
    .from("text_agent_conversations")
    .select("id, metadata, contact_label, channel, unread_count")
    .eq("id", input.conversationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error || !row) {
    console.error("[handoff] conversación no encontrada:", error?.message);
    return { escalated: false, emailSent: false };
  }

  const meta = asMeta(row.metadata);
  const alreadyNotified = Boolean(meta.handoff_notified_at);
  const nowIso = new Date().toISOString();

  const nextMeta: Record<string, unknown> = {
    ...meta,
    handoff_reason: input.reason,
    handoff_requested_at: meta.handoff_requested_at ?? nowIso
  };

  const unread = Math.max(1, Number(row.unread_count) || 0);

  const { error: updateErr } = await input.db
    .from("text_agent_conversations")
    .update({
      handoff_mode: "human",
      assigned_to: null,
      status_label: "Esperando asesor",
      unread_count: unread < 1 ? 1 : unread,
      metadata: nextMeta,
      updated_at: nowIso
    })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  if (updateErr) {
    console.error("[handoff] update:", updateErr.message);
    return { escalated: false, emailSent: false };
  }

  if (alreadyNotified || !input.organizationId) {
    return { escalated: true, emailSent: false };
  }

  const contactLabel = input.contactLabel ?? (row.contact_label ? String(row.contact_label) : null);
  const channel = input.channel || String(row.channel ?? "");

  const result = await notifyOrgHandoff({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    channel,
    agentName: input.agentName ?? null,
    contactLabel,
    visitorMessage: input.visitorMessage ?? null,
    reason: input.reason
  });

  // Push a todo el equipo con acceso al inbox — no bloquea ni depende del email.
  void notifyPushForOrg(input.organizationId, {
    title: "Nueva conversación esperando asesor",
    body: `${contactLabel || "Visitante"} · ${channelLabel(channel)}`,
    url: `/m/chats/${input.conversationId}`,
    tag: `handoff-${input.conversationId}`
  });

  if (!result.sent) {
    console.warn("[handoff] email no enviado:", JSON.stringify(result));
    return { escalated: true, emailSent: false };
  }

  await input.db
    .from("text_agent_conversations")
    .update({
      metadata: { ...nextMeta, handoff_notified_at: nowIso },
      updated_at: new Date().toISOString()
    })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  return { escalated: true, emailSent: true };
}
