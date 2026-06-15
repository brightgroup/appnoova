import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { CrmContact, CrmLead, CrmTimelineEvent } from "@/types/crm";
import { analyzeChatConversation } from "@/lib/text-chat-analysis";
import { buildChatFallbackSummary } from "@/lib/text-chat-utils";

const TIMELINE_DAY_SUMMARIES_KEY = "timeline_day_summaries";

export type TimelineDaySummaryCache = {
  summary: string;
  message_count: number;
  last_message_at: string;
  analyzed_at: string;
};

export function readTimelineDaySummaries(
  metadata: Record<string, unknown> | null | undefined
): Record<string, TimelineDaySummaryCache> {
  const raw = metadata?.[TIMELINE_DAY_SUMMARIES_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, TimelineDaySummaryCache>;
}

function isTimelineDayCacheValid(
  cache: TimelineDaySummaryCache | undefined,
  msgs: TextChatMessage[]
): boolean {
  if (!cache?.summary?.trim()) return false;
  if (cache.message_count !== msgs.length) return false;
  const lastAt = msgs[msgs.length - 1]?.created_at;
  return Boolean(lastAt && cache.last_message_at === lastAt);
}

function formatLapseDay(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

async function summarizeDayMessages(
  day: string,
  msgs: TextChatMessage[],
  caches: Record<string, TimelineDaySummaryCache>
): Promise<{ summary: string; cache?: TimelineDaySummaryCache }> {
  const cached = caches[day];
  if (isTimelineDayCacheValid(cached, msgs)) {
    return { summary: cached!.summary };
  }

  let summary: string;
  if (msgs.length >= 2) {
    const analysis = await analyzeChatConversation(msgs);
    summary = analysis.summary;
  } else {
    const only = msgs[0]?.content?.trim();
    if (only) summary = only.length > 160 ? `${only.slice(0, 160)}…` : only;
    else summary = buildChatFallbackSummary(msgs);
  }

  const lastAt = msgs[msgs.length - 1]?.created_at;
  if (!lastAt) return { summary };

  return {
    summary,
    cache: {
      summary,
      message_count: msgs.length,
      last_message_at: lastAt,
      analyzed_at: new Date().toISOString()
    }
  };
}

async function buildConversationLapses(
  messages: TextChatMessage[],
  daySummaries: Record<string, TimelineDaySummaryCache>
): Promise<{
  events: CrmTimelineEvent[];
  daySummaries: Record<string, TimelineDaySummaryCache>;
}> {
  const sorted = [...messages]
    .filter(m => m.created_at)
    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());

  if (!sorted.length) return { events: [], daySummaries };

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

  const nextCaches = { ...daySummaries };
  const events = await Promise.all(
    days.map(async ([day, msgs]) => {
      const { summary, cache } = await summarizeDayMessages(day, msgs, nextCaches);
      if (cache) nextCaches[day] = cache;

      return {
        id: `lapse-${day}`,
        kind: "conversation_lapse" as const,
        at: msgs[msgs.length - 1].created_at!,
        title: `Conversación WhatsApp · ${formatLapseDay(day)}`,
        body: summary,
        channel: "whatsapp"
      };
    })
  );

  return { events, daySummaries: nextCaches };
}

export function mergeTimelineDaySummaries(
  metadata: Record<string, unknown> | null | undefined,
  daySummaries: Record<string, TimelineDaySummaryCache>
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};

  return {
    ...base,
    [TIMELINE_DAY_SUMMARIES_KEY]: daySummaries
  };
}

export function timelineDaySummariesChanged(
  before: Record<string, TimelineDaySummaryCache>,
  after: Record<string, TimelineDaySummaryCache>
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export async function buildContactTimeline(input: {
  contact: CrmContact;
  leads: CrmLead[];
  messages: TextChatMessage[];
  daySummaries?: Record<string, TimelineDaySummaryCache>;
  calls: Array<{
    id: string;
    created_at: string;
    duration_sec: number;
    summary: string;
    status_label: string;
  }>;
}): Promise<{
  events: CrmTimelineEvent[];
  daySummaries: Record<string, TimelineDaySummaryCache>;
}> {
  const events: CrmTimelineEvent[] = [];
  const initialDaySummaries = input.daySummaries ?? {};

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

  const { events: lapseEvents, daySummaries } = await buildConversationLapses(
    input.messages,
    initialDaySummaries
  );
  events.push(...lapseEvents);

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

  return {
    events: events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    daySummaries
  };
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
    if (lead.proxima_accion) {
      const when = lead.proxima_accion_fecha
        ? ` (${new Date(lead.proxima_accion_fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" })})`
        : "";
      return {
        message: `${lead.proxima_accion}${when}`,
        action: "lead",
        href: `/dashboard/crm/leads/${lead.id}`
      };
    }
    return {
      message: `Lead abierto «${lead.title}» — define la próxima acción.`,
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
