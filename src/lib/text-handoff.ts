import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrgHandoff, buildHandoffWhatsAppBody, channelLabel, type HandoffNotifyContext } from "@/lib/email/notify-handoff";
import { notifyPushForOrg } from "@/lib/push/send";
import { normalizeNotifyTeamRules, type NotifyTeamRules } from "@/lib/text-notify-rules";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp/send-transport";
import { getApprovedSingleVarTemplate } from "@/lib/whatsapp/notify-template";
import { getOrgInboxTeamUserIds } from "@/lib/push/team";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

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

/**
 * Deben indicar un traspaso INMEDIATO dentro de este mismo chat, no una
 * promesa de contacto futuro ("un asesor te llamará mañana", "te transfiero
 * con un ejecutivo para que te cotice") — eso es lenguaje normal de cierre
 * de venta, no una cesión real de la conversación. Antes incluía patrones
 * más amplios ("te paso", "te transfiero", "un asesor te contactará") que
 * disparaban falsos positivos con ese tipo de frases, dejando la
 * conversación en modo humano sin que nadie la tomara.
 */
const ASSISTANT_HANDOFF_PATTERNS: RegExp[] = [
  /\b(quedo|quedas?)\s+en\s+(manos|espera)\b/i,
  /\ben\s+un\s+momento\s+te\s+atienden?\b/i,
  /\b(te\s+paso|te\s+transfiero|te\s+derivo)\b[\s\S]{0,40}\b(ahora|ya|en\s+este\s+momento|de\s+una)\b/i
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

/** Minutos sin respuesta humana tras los cuales la conversación vuelve sola a la IA. */
export const HUMAN_HANDOFF_AUTO_RETURN_MS = 30 * 60 * 1000;

/**
 * Milisegundos que lleva el visitante esperando sin respuesta humana: tiempo
 * desde el primer mensaje de usuario sin contestar tras la última respuesta
 * humana o de la IA. Null si el último turno ya fue respondido (nadie está
 * esperando en este momento).
 */
export function getHumanHandoffPendingSinceMs(
  messages: Array<{ role: string; created_at?: string | null }>
): number | null {
  let pendingAt: number | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") break;
    const t = m.created_at ? new Date(m.created_at).getTime() : NaN;
    if (!Number.isNaN(t)) pendingAt = t;
  }
  return pendingAt;
}

/**
 * Si un humano tomó la conversación pero lleva demasiado tiempo sin contestar
 * al visitante, se devuelve sola a la IA para que el contacto nunca se quede
 * sin respuesta de nadie (ver `getHumanHandoffPendingSinceMs`).
 */
export function shouldAutoReturnToAi(
  messages: Array<{ role: string; created_at?: string | null }>
): boolean {
  const pendingAt = getHumanHandoffPendingSinceMs(messages);
  if (pendingAt === null) return false;
  return Date.now() - pendingAt > HUMAN_HANDOFF_AUTO_RETURN_MS;
}

/**
 * Si la organización tiene un solo miembro con acceso al inbox, no hay
 * ambigüedad de "a quién" asignar — se le asigna directo para no meter
 * fricción innecesaria (reclamarla manualmente) cuando no hay nadie más a
 * quien pudiera haberle tocado. Con 2+ miembros (o ninguno) se deja como
 * cola compartida sin asignar, para no asignarle a alguien que esté
 * ausente mientras el resto del equipo no la ve como pendiente.
 */
async function resolveSoleInboxAssignee(
  db: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const userIds = await getOrgInboxTeamUserIds(organizationId);
  if (userIds.length !== 1) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", userIds[0])
    .maybeSingle();

  const name = String(profile?.full_name ?? "").trim();
  if (name) return name;
  const email = String(profile?.email ?? "").trim();
  return email || null;
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
  /** Reglas de notificación del agente (evento "human_handoff"). Si no se pasa, se asume el default (email+push activos). */
  notifyRules?: NotifyTeamRules | unknown;
  /** Canal WhatsApp de la org, para avisar al equipo por ese medio si está activado. */
  outboundWhatsAppChannel?: WhatsAppChannelRecord | null;
}

/**
 * Marca la conversación en modo humano — asignada directo si la org tiene
 * un solo miembro con acceso al inbox (ver `resolveSoleInboxAssignee`), o
 * como cola compartida sin asignar si hay varios — y notifica por email al
 * equipo de la org (una sola vez).
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

  const soleAssignee = input.organizationId
    ? await resolveSoleInboxAssignee(input.db, input.organizationId)
    : null;

  const { error: updateErr } = await input.db
    .from("text_agent_conversations")
    .update({
      handoff_mode: "human",
      assigned_to: soleAssignee,
      status_label: soleAssignee ? "Atendido por humano" : "Esperando asesor",
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

  const rule = normalizeNotifyTeamRules(input.notifyRules).human_handoff!;
  if (!rule.enabled) {
    return { escalated: true, emailSent: false };
  }

  const notifyCtx: HandoffNotifyContext = {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    channel,
    agentName: input.agentName ?? null,
    contactLabel,
    visitorMessage: input.visitorMessage ?? null,
    reason: input.reason
  };

  let emailSent = false;
  if (rule.email) {
    const result = await notifyOrgHandoff(notifyCtx);
    emailSent = result.sent;
    if (!result.sent) {
      console.warn("[handoff] email no enviado:", JSON.stringify(result));
    }
  }

  if (rule.push) {
    // No bloquea ni depende del email.
    void notifyPushForOrg(input.organizationId, {
      title: "Nueva conversación esperando asesor",
      body: `${contactLabel || "Visitante"} · ${channelLabel(channel)}`,
      url: `/m/chats/${input.conversationId}`,
      tag: `handoff-${input.conversationId}`
    });
  }

  if (rule.whatsapp && rule.whatsapp_destinations.length && input.outboundWhatsAppChannel) {
    const template = rule.whatsapp_template_id
      ? await getApprovedSingleVarTemplate(input.db, rule.whatsapp_template_id, input.outboundWhatsAppChannel.id)
      : null;

    if (!template) {
      console.warn("[handoff] WhatsApp activo pero sin plantilla aprobada configurada");
    } else {
      const body = buildHandoffWhatsAppBody(notifyCtx);
      for (const toE164 of rule.whatsapp_destinations) {
        try {
          await sendWhatsAppTemplateMessage({
            channel: input.outboundWhatsAppChannel,
            toE164,
            contentSid: template.contentSid,
            contentVariables: { "1": body }
          });
        } catch (err) {
          console.warn("[handoff] whatsapp a", toE164, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  if (!emailSent) {
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
