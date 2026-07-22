"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Clock,
  Loader2,
  MessageSquare,
  Phone,
  Sparkles,
  UserPlus
} from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import { formatLeadValue } from "@/lib/crm-record";
import type { CrmLead, CrmTimelineEvent, CrmTimelineEventKind } from "@/types/crm";

const KIND_META: Record<
  CrmTimelineEventKind,
  { icon: typeof MessageSquare; accent: string; dot: string }
> = {
  conversation_lapse: { icon: MessageSquare, accent: "text-emerald-300", dot: "bg-emerald-400" },
  message_in: { icon: MessageSquare, accent: "text-emerald-300", dot: "bg-emerald-400" },
  message_out: { icon: MessageSquare, accent: "text-[#a5a5ff]", dot: "bg-[#5b5bf6]" },
  call: { icon: Phone, accent: "text-sky-300", dot: "bg-sky-400" },
  lead: { icon: Sparkles, accent: "text-amber-300", dot: "bg-amber-400" },
  contact_created: { icon: UserPlus, accent: "text-gray-400", dot: "bg-gray-500" },
  appointment: { icon: CalendarCheck, accent: "text-teal-300", dot: "bg-teal-400" }
};

interface CrmContactTimelineProps {
  contactId: string;
  inboxConversationId?: string | null;
  leads?: CrmLead[];
}

export function CrmContactTimeline({ contactId, inboxConversationId, leads = [] }: CrmContactTimelineProps) {
  const [events, setEvents] = useState<CrmTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/contacts/${contactId}/timeline`, { headers });
    const data = await res.json();
    if (res.ok) setEvents(data.events ?? []);
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center text-gray-400 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando actividad…
      </div>
    );
  }

  if (events.length === 0 && leads.length === 0) {
    return (
      <div className="rounded-xl border border-white/[.06] bg-white/[.02] px-5 py-10 text-center">
        <Clock className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Sin actividad registrada todavía.</p>
        {inboxConversationId && (
          <Link href={`/dashboard/inbox?id=${inboxConversationId}`} className="inline-block mt-3 text-xs text-[#a5a5ff] hover:text-white">
            Ver conversación en inbox →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {leads.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Leads</h3>
          <ul className="space-y-2">
            {leads.map(lead => (
              <li key={lead.id}>
                <Link
                  href={`/dashboard/crm/leads/${lead.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3 hover:border-white/[.12] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{lead.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lead.outcome === "open" ? "Abierto" : lead.outcome === "won" ? "Ganado" : "Perdido"}
                      {" · "}
                      {formatCrmDateTime(lead.created_at)}
                    </p>
                  </div>
                  <span className="text-xs text-[#a5a5ff] shrink-0">{formatLeadValue(lead.value_amount, lead.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Historial</h3>
            {inboxConversationId && (
              <Link href={`/dashboard/inbox?id=${inboxConversationId}`} className="text-[10px] text-[#a5a5ff] hover:text-white">
                Ver conversación completa →
              </Link>
            )}
          </div>
          <ul className="space-y-0">
              {events.map((ev, index) => {
                const meta = KIND_META[ev.kind];
                const Icon = meta.icon;
                const isLast = index === events.length - 1;
                return (
                  <li key={ev.id} className="flex gap-4">
                    <div className="flex w-4 shrink-0 flex-col items-center">
                      <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${meta.dot}`} />
                      {!isLast && (
                        <div className={`my-1 w-0.5 flex-1 min-h-[2.5rem] rounded-full ${meta.dot}`} />
                      )}
                    </div>
                    <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className={`mt-0.5 shrink-0 ${meta.accent}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <p className="text-sm font-medium leading-snug text-white">{ev.title}</p>
                        </div>
                        <time className="shrink-0 whitespace-nowrap pt-0.5 text-[10px] text-gray-500">
                          {formatCrmDateTime(ev.at)}
                        </time>
                      </div>
                      {ev.body && (
                        <p className="mt-2 text-xs leading-relaxed text-gray-400">{ev.body}</p>
                      )}
                      {ev.kind === "conversation_lapse" && inboxConversationId && (
                        <Link
                          href={`/dashboard/inbox?id=${inboxConversationId}`}
                          className="mt-2 inline-block text-[10px] font-medium text-[#a5a5ff] hover:text-white"
                        >
                          Abrir en inbox →
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
        </section>
      )}
    </div>
  );
}

interface CrmContactNextStepProps {
  message: string;
  href?: string;
}

export function CrmContactNextStep({ message, href }: CrmContactNextStepProps) {
  return (
    <div className="mb-6 rounded-xl border border-[#5b5bf6]/20 bg-[#5b5bf6]/[.06] px-4 py-3 flex items-start gap-3">
      <Sparkles className="w-4 h-4 text-[#a5a5ff] shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a5a5ff] mb-0.5">Próximo paso</p>
        <p className="text-sm text-gray-200">{message}</p>
        {href && (
          <Link href={href} className="inline-block mt-2 text-xs font-medium text-[#a5a5ff] hover:text-white">
            Ir →
          </Link>
        )}
      </div>
    </div>
  );
}

interface CrmContactDuplicatesBannerProps {
  contactId: string;
  onMerged: () => void;
}

export function CrmContactDuplicatesBanner({ contactId, onMerged }: CrmContactDuplicatesBannerProps) {
  const [groups, setGroups] = useState<Array<{ key: string; field: string; contacts: { id: string; name: string }[] }>>([]);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/duplicates?contact_id=${contactId}`, { headers });
      const data = await res.json();
      if (res.ok) setGroups(data.groups ?? []);
    })();
  }, [contactId]);

  if (groups.length === 0) return null;

  const others = groups.flatMap(g =>
    g.contacts.filter(c => c.id !== contactId).map(c => ({ ...c, field: g.field }))
  );
  if (others.length === 0) return null;

  const mergeAll = async () => {
    if (!confirm(`¿Fusionar ${others.length} contacto(s) duplicado(s) en esta ficha?`)) return;
    setMerging(true);
    const headers = await getAuthHeaders();
    await fetch("/api/crm/contacts/merge", {
      method: "POST",
      headers,
      body: JSON.stringify({
        primary_id: contactId,
        merge_ids: others.map(o => o.id)
      })
    });
    setMerging(false);
    onMerged();
  };

  return (
    <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-4 py-3">
      <p className="text-sm font-medium text-amber-200">Posibles duplicados detectados</p>
      <ul className="mt-2 space-y-1">
        {others.map(o => (
          <li key={o.id} className="text-xs text-amber-100/80">
            {o.name} <span className="text-amber-200/50">({o.field})</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={merging}
        onClick={mergeAll}
        className="mt-3 text-xs font-semibold text-amber-200 hover:text-white disabled:opacity-50"
      >
        {merging ? "Fusionando…" : "Fusionar en este contacto"}
      </button>
    </div>
  );
}
