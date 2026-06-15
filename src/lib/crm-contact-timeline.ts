import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { CrmContact, CrmLead, CrmTimelineEvent } from "@/types/crm";
import { analyzeChatConversation } from "@/lib/text-chat-analysis";
import { buildChatFallbackSummary } from "@/lib/text-chat-utils";

function formatLapseDay(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

async function summarizeDayMessages(msgs: TextChatMessage[]): Promise<string> {
  if (msgs.length >= 2) {
    const analysis = await analyzeChatConversation(msgs);
    return analysis.summary;
  }
  const only = msgs[0]?.content?.trim();
  if (only) return only.length > 160 ? `${only.slice(0, 160)}…` : only;
  return buildChatFallbackSummary(msgs);
}

async function buildConversationLapses(messages: TextChatMessage[]): Promise<CrmTimelineEvent[]> {
  const sorted = [...messages]
    .filter(m => m.created_at)
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  if (!sorted.length) return [];

  const byDay = new Map<string, TextChatMessage[]>();
  for (const msg of sorted) {
    const day = new Date(msg.created_at!).toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(msg);
    byDay.set(day, list);
  }

  const days = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 20);

  const events = await Promise.all(
    days.map(async ([day, msgs]) => ({
      id: `lapse-${day}`,
      kind: "conversation_lapse" as const,
      at: msgs[msgs.length - 1].created_at!,
      title: `Conversación WhatsApp · ${formatLapseDay(day)}`,
      body: await summarizeDayMessages(msgs),
      channel: "whatsapp"
    }))
  );

  return events;
}

export async function buildContactTimeline(input: {
  contact: CrmContact;
  leads: CrmLead[];
  messages: TextChatMessage[];
  calls: Array<{
    id: string;
    created_at: string;
    duration_sec: number;
    summary: string;
    status_label: string;
  }>;
}): Promise<CrmTimelineEvent[]> {
  const events: CrmTimelineEvent[] = [];

  events.push({
    id: `contact-${input.contact.id}`,
    kind: "contact_created",
    at: input.contact.created_at,
    title: "Contacto creado",
    body: input.contact.fuente_origen ?? undefined
  });

  for (const lead of input.leads) {
    events.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      at: lead.created_at,
      title: `Lead: ${lead.title}`,
      body: lead.outcome === "open" ? "Abierto" : lead.outcome === "won" ? "Ganado" : "Perdido"
    });
  }

  events.push(...(await buildConversationLapses(input.messages)));

  for (const call of input.calls) {
    events.push({
      id: `call-${call.id}`,
      kind: "call",
      at: call.created_at,
      title: "Llamada de voz",
      body: call.summary || call.status_label,
      channel: "telefono"
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function findDuplicateGroups(
  contacts: Array<Pick<CrmContact, "id" | "name" | "whatsapp" | "email" | "documento_id" | "updated_at">>
): import("@/types/crm").CrmContactDuplicateGroup[] {
  const groups: import("@/types/crm").CrmContactDuplicateGroup[] = [];

  const byField = (
    field: "whatsapp" | "email" | "documento_id",
    getValue: (c: (typeof contacts)[0]) => string | null | undefined
  ) => {
    const map = new Map<string, typeof contacts>();
    for (const c of contacts) {
      const v = getValue(c)?.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    for (const [value, list] of map) {
      if (list.length < 2) continue;
      groups.push({
        key: `${field}:${value}`,
        field,
        value,
        contacts: list.map(c => ({
          id: c.id,
          name: c.name,
          whatsapp: c.whatsapp,
          email: c.email,
          updated_at: c.updated_at
        }))
      });
    }
  };

  byField("whatsapp", c => c.whatsapp);
  byField("email", c => c.email);
  byField("documento_id", c => c.documento_id);

  return groups;
}

export function computeContactNextStep(input: {
  contact: CrmContact;
  openLeads: CrmLead[];
}): import("@/types/crm").CrmContactNextStep | null {
  const { contact, openLeads } = input;

  if (contact.ventana_wa_estado === "abierta" && contact.inbox_conversation_id) {
    return {
      message: "Ventana WhatsApp abierta — continúa la conversación ahora.",
      action: "inbox",
      href: `/dashboard/inbox?id=${contact.inbox_conversation_id}`
    };
  }

  if (contact.ventana_wa_estado === "requiere_plantilla" && contact.inbox_conversation_id) {
    return {
      message: "Sin actividad reciente — reactiva con plantilla aprobada.",
      action: "template",
      href: `/dashboard/inbox?id=${contact.inbox_conversation_id}`
    };
  }

  if (openLeads.length > 0) {
    const lead = openLeads[0];
    return {
      message: `Lead abierto «${lead.title}» — da seguimiento.`,
      action: "lead",
      href: `/dashboard/crm/leads/${lead.id}`
    };
  }

  if (!contact.whatsapp && !contact.telefono && !contact.email) {
    return {
      message: "Agrega al menos un canal de contacto para habilitar acciones.",
      action: "edit"
    };
  }

  if (contact.tipo_relacion === "prospecto" && contact.ventana_wa_estado === "sin_conversacion") {
    return {
      message: "Prospecto sin conversación — espera inbound de WhatsApp o crea un lead.",
      action: "lead",
      href: `/dashboard/crm/leads/nuevo?contact_id=${contact.id}`
    };
  }

  return null;
}
