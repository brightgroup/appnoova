"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
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
  conversation_lapse: { icon: MessageSquare, accent: "text-emerald-300", dot: "border-emerald-400/60" },
  message_in: { icon: MessageSquare, accent: "text-emerald-300", dot: "border-emerald-400/60" },
  message_out: { icon: MessageSquare, accent: "text-[#a5a5ff]", dot: "border-[#5b5bf6]/60" },
  call: { icon: Phone, accent: "text-sky-300", dot: "border-sky-400/60" },
  lead: { icon: Sparkles, accent: "text-amber-300", dot: "border-amber-400/60" },
  contact_created: { icon: UserPlus, accent: "text-gray-400", dot: "border-gray-500/60" }
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
          <div className="relative pl-5">
            <div className="absolute left-[5px] top-3 bottom-3 w-px bg-white/[.08]" />
            <ul className="space-y-4">
              {events.map(ev => {
                const meta = KIND_META[ev.kind];
                const Icon = meta.icon;
                return (
                  <li key={ev.id} className="relative pl-5">
                    <span
                      className={`absolute left-0 top-4 w-[11px] h-[11px] rounded-full border-2 bg-noova-main ${meta.dot}`}
                    />
                    <div className="rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3.5 hover:border-white/[.10] transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 ${meta.accent}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-white leading-snug">{ev.title}</p>
                            <time className="text-[10px] text-gray-500 shrink-0 whitespace-nowrap pt-0.5">
                              {formatCrmDateTime(ev.at)}
                            </time>
                          </div>
                          {ev.body && (
                            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{ev.body}</p>
                          )}
                          {ev.kind === "conversation_lapse" && inboxConversationId && (
                            <Link
                              href={`/dashboard/inbox?id=${inboxConversationId}`}
                              className="inline-block mt-2 text-[10px] font-medium text-[#a5a5ff] hover:text-white"
                            >
                              Abrir en inbox →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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
