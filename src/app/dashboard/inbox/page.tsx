"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  FileText,
  Filter,
  Film,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  User,
  X
} from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  formatInboxDisplayTitle,
  formatInboxMessageTime,
  formatInboxTime,
  inboxMessageStableKey,
  isToday,
  mergeInboxTextDetail
} from "@/lib/inbox-utils";
import { inboxChannelStyle } from "@/lib/inbox-channel-ui";
import type { InboxFilter, InboxListItem, InboxTextDetail } from "@/types/inbox";
import type { TextChatMessage } from "@/types/text-agent-conversation";
import type { WhatsAppTemplateRecord } from "@/types/whatsapp-template";
import { renderTemplatePreview } from "@/lib/whatsapp/template-record";
import { InboxTemplateComposer } from "@/components/inbox/InboxTemplateComposer";
import { NoovaListMenu, NoovaListMenuItem } from "@/components/ui/NoovaSelect";

type AssignValue = "ai" | "me";

function AgentAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold leading-none text-white/80">
      {initial}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const style = inboxChannelStyle(channel);
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 ${style.badgeClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {style.label}
    </span>
  );
}

function InboxPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<InboxListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("id"));
  const [detail, setDetail] = useState<InboxTextDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [offline, setOffline] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("Usuario");
  const [reply, setReply] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const assignRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const mediaPlaybackCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleMediaPlaybackStart = useCallback(() => {
    mediaPlaybackCountRef.current += 1;
  }, []);

  const handleMediaPlaybackEnd = useCallback(() => {
    mediaPlaybackCountRef.current = Math.max(0, mediaPlaybackCountRef.current - 1);
  }, []);

  const isNearBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }, []);

  const handleMessagesScroll = useCallback(() => {
    stickToBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  useEffect(() => {
    setSelectedId(searchParams.get("id"));
  }, [searchParams]);

  const setConversationInUrl = useCallback(
    (id: string | null) => {
      const qs = new URLSearchParams(searchParams.toString());
      if (id) qs.set("id", id);
      else qs.delete("id");
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/inbox?filter=${filter}`, { headers });
      if (res.status === 404) {
        if (!silent) {
          setError("El Inbox aún no está desplegado en este entorno. Usa localhost o haz deploy a producción.");
        }
        setItems([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) {
          setError(
            data.error ||
            (res.status === 503
              ? "Falta la migración 016_inbox_handoff en Supabase."
              : "Error al cargar inbox")
          );
        }
        return;
      }
      setItems(data.items ?? []);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
    } catch {
      if (!silent) setError("Error de red al conectar con /api/inbox");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    if (!silent) setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/inbox?id=${id}`, { headers });
      if (res.status === 404) {
        if (!silent) {
          setError("Conversación o API no disponible en este entorno.");
        }
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) setError(data.error || "Error al cargar conversación");
        return;
      }
      const loaded = data.detail ?? null;
      const next = loaded?.kind === "text" ? loaded : null;
      setDetail(prev => {
        if (!next) return null;
        if (!prev || prev.kind !== "text" || prev.id !== next.id) return next;
        return mergeInboxTextDetail(prev, next);
      });
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
      setItems(prev =>
        prev.map(item => (item.id === id ? { ...item, unread_count: 0 } : item))
      );
    } catch {
      if (!silent) setError("Error de red al cargar conversación");
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const timer = window.setInterval(() => loadList(true), 2000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const timer = window.setInterval(() => {
      if (mediaPlaybackCountRef.current > 0) return;
      void loadDetail(selectedId, true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadDetail]);

  const loadWaTemplates = useCallback(async (conversationId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/templates?conversation_id=${conversationId}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setWaTemplates(data.templates ?? []);
      } else {
        setWaTemplates([]);
      }
    } catch {
      setWaTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (
      !selectedId ||
      !detail ||
      detail.kind !== "text" ||
      detail.channel !== "whatsapp" ||
      detail.whatsapp_session_open !== false ||
      detail.whatsapp_opted_out
    ) {
      setWaTemplates([]);
      setSelectedTemplateId("");
      setTemplateVars([]);
      return;
    }
    loadWaTemplates(selectedId);
  }, [selectedId, detail, loadWaTemplates]);

  useEffect(() => {
    const tpl = waTemplates.find(t => t.id === selectedTemplateId);
    if (!tpl) {
      setTemplateVars([]);
      return;
    }
    setTemplateVars(tpl.variable_labels.map(() => ""));
  }, [selectedTemplateId, waTemplates]);

  useEffect(() => {
    stickToBottomRef.current = true;
    prevMessageCountRef.current = 0;
  }, [selectedId]);

  useEffect(() => {
    if (!detail || detail.kind !== "text" || detail.id !== selectedId) return;

    const messageCount = detail.messages.length;
    const hadMoreMessages = messageCount > prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;

    if (!hadMoreMessages) return;
    if (!stickToBottomRef.current && !isNearBottom()) return;

    requestAnimationFrame(() => {
      scrollToBottom("smooth");
    });
  }, [detail, selectedId, isNearBottom, scrollToBottom]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssignOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      i =>
        i.display_title.toLowerCase().includes(q) ||
        i.contact_label.toLowerCase().includes(q) ||
        i.preview.toLowerCase().includes(q) ||
        i.agent_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const selectItem = (item: InboxListItem) => {
    setSelectedId(item.id);
    setConversationInUrl(item.id);
    setReply("");
    setAssignOpen(false);
    setSelectedTemplateId("");
    setTemplateVars([]);

    if (item.channel === "whatsapp") {
      void getAuthHeaders().then(headers =>
        fetch("/api/crm/contacts/sync-from-conversation", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: item.id })
        })
      );
    }
  };

  const assignConversation = async (value: AssignValue) => {
    if (!selectedId) return;
    setAssignOpen(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: selectedId,
          assign_to: value === "me" ? "me" : "ai"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo asignar");
        return;
      }
      await loadDetail(selectedId);
      await loadList();
    } catch {
      setError("Error de red al asignar");
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !selectedId || sending) return;
    if (detail?.kind !== "text" || detail.handoff_mode !== "human" || !detail.assigned_to) return;

    setSending(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedId, content: text })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar");
        return;
      }
      setReply("");
      stickToBottomRef.current = true;
      await loadDetail(selectedId);
      await loadList();
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } catch {
      setError("Error de red al enviar");
    }
    setSending(false);
  };

  const sendTemplate = async () => {
    if (!selectedId || !selectedTemplateId || sending) return;
    if (detail?.kind !== "text" || detail.handoff_mode !== "human" || !detail.assigned_to) return;

    setSending(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/inbox/send-template", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: selectedId,
          template_id: selectedTemplateId,
          variables: templateVars
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar plantilla");
        return;
      }
      setSelectedTemplateId("");
      setTemplateVars([]);
      await loadDetail(selectedId);
      await loadList();
    } catch {
      setError("Error de red al enviar plantilla");
    }
    setSending(false);
  };

  const selectedTemplate = waTemplates.find(t => t.id === selectedTemplateId) ?? null;
  const templatePreview =
    selectedTemplate && templateVars.every(v => v.trim())
      ? renderTemplatePreview(selectedTemplate.body_preview, templateVars)
      : selectedTemplate?.body_preview ?? "";

  const showTemplateComposer =
    detail?.kind === "text" &&
    detail.channel === "whatsapp" &&
    detail.whatsapp_session_open === false &&
    !detail.whatsapp_opted_out &&
    detail.handoff_mode === "human" &&
    Boolean(detail?.assigned_to) &&
    !offline;

  const canSendTemplate = showTemplateComposer && waTemplates.length > 0;

  const canReply =
    detail?.handoff_mode === "human" &&
    Boolean(detail?.assigned_to) &&
    !offline &&
    (detail.kind !== "text" ||
      detail.channel !== "whatsapp" ||
      (detail.whatsapp_session_open !== false && !detail.whatsapp_opted_out));

  const assignLabel =
    detail?.handoff_mode === "human" && detail?.assigned_to
      ? detail.assigned_to
      : "IA";

  const detailTitle =
    detail?.display_title ??
    (detail
      ? formatInboxDisplayTitle(detail.contact_label, detail.channel, detail.id)
      : "Cargando...");

  const tabs: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "mine", label: "Mías" },
    { id: "unassigned", label: "Sin asignar" }
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-noova-main text-white">
      {/* Bandeja — oculta en tablet/móvil cuando hay conversación abierta */}
      <aside
        className={`flex min-w-0 shrink-0 flex-col border-r border-white/[.06] bg-noova-main ${
          selectedId
            ? "hidden xl:flex xl:w-[320px] 2xl:w-[360px]"
            : "flex w-full md:w-[320px] lg:w-[360px]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/[.05] px-5 py-4">
          <h1 className="text-base font-semibold text-white">Inbox</h1>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white/50">
            <span>{offline ? "Offline" : "Online"}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!offline}
              onClick={() => setOffline(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${offline ? "bg-white/10" : "bg-[#5b5bf6]"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${offline ? "left-0.5" : "left-[22px]"}`}
              />
            </button>
          </label>
        </div>

        <div className="flex items-center gap-2.5 border-b border-white/[.05] px-4 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full rounded-xl border border-white/[.08] bg-white/[.08] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-[#5b5bf6]/40 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => loadList()}
            className="rounded-xl border border-white/[.08] bg-white/[.08] p-2.5 text-white/50 transition-colors hover:text-white"
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/[.08] bg-white/[.08] p-2.5 text-white/50 transition-colors hover:text-white"
            aria-label="Filtros"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-white/[.05] px-4 py-3">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                filter === tab.id
                  ? "bg-[#5b5bf6] text-white"
                  : "bg-white/[.10] text-white/60 hover:text-white/90"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && !loading && (
            <div className="mx-4 mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200/90">
              {error}
            </div>
          )}
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-white/40">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Cargando conversaciones...
            </div>
          ) : filteredItems.length === 0 && !error ? (
            <p className="px-5 py-10 text-center text-sm text-white/40">
              No hay conversaciones todavía. Aparecerán aquí los chats del micrositio y las pruebas de agentes de texto.
            </p>
          ) : filteredItems.length === 0 ? null : (
            filteredItems.map(item => {
              const active = selectedId === item.id;
              const hasUnread = item.unread_count > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={`w-full border-b border-white/[.04] px-5 py-3.5 text-left transition-colors ${
                    active
                      ? "bg-white/[.08]"
                      : hasUnread
                        ? "bg-[#5b5bf6]/[.12] hover:bg-[#5b5bf6]/[.16]"
                        : "hover:bg-white/[.04]"
                  } ${hasUnread ? "border-l-2 border-l-[#5b5bf6]" : "border-l-2 border-l-transparent"}`}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span
                      className={`truncate text-sm text-white ${
                        hasUnread ? "font-bold" : "font-bold"
                      }`}
                    >
                      {item.display_title}
                    </span>
                    <span className="shrink-0 text-xs text-white/40">
                      {formatInboxTime(item.updated_at)}
                    </span>
                  </div>
                  <p
                    className={`mb-2.5 line-clamp-2 text-sm leading-snug ${
                      hasUnread ? "font-medium text-white/90" : "text-white/75"
                    }`}
                  >
                    {item.preview}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ChannelBadge channel={item.channel} />
                      <AgentAvatar name={item.agent_name} />
                      <span className="text-xs text-white/50">{item.agent_name}</span>
                    </div>
                    {hasUnread && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5b5bf6] px-1.5 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(91,91,246,0.5)]">
                        {item.unread_count > 9 ? "9+" : item.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conversación — pantalla completa en tablet/móvil cuando hay chat abierto */}
      <section
        className={`flex min-w-0 flex-1 flex-col bg-[#111113] ${
          selectedId ? "flex" : "hidden md:flex"
        }`}
      >
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-white/30">
            <MessageSquare className="mb-4 h-12 w-12 opacity-40" />
            <p className="text-base text-white/50">Selecciona una conversación</p>
            <p className="mt-2 max-w-sm text-center text-sm text-white/30">
              Chats del micrositio y pruebas de agentes de texto aparecen en la lista.
            </p>
          </div>
        ) : (
          <>
            <header className="border-b border-white/[.04] px-4 py-3 lg:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {selectedId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setDetail(null);
                        setConversationInUrl(null);
                      }}
                      className="mt-0.5 shrink-0 rounded-xl p-2 text-white/50 transition-colors hover:bg-white/[.06] hover:text-white lg:hidden"
                      aria-label="Volver a la lista"
                    >
                      <ChevronDown className="h-5 w-5 rotate-90" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white sm:text-base">{detailTitle}</p>
                    {detail && (
                      <p className="mt-0.5 truncate text-xs text-white/40 sm:text-sm">
                        {detail.channel_label}
                        {" · "}
                        {detail.agent_name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 pl-11 lg:pl-0">
                  {detail?.kind === "text" && (
                    <div className="relative" ref={assignRef}>
                      <button
                        type="button"
                        onClick={() => setAssignOpen(v => !v)}
                        className="flex max-w-[140px] items-center gap-1.5 rounded-xl border border-white/[.10] bg-white/[.08] px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/[.10] lg:max-w-none lg:py-2.5 lg:text-sm"
                      >
                        <span className="truncate">{assignLabel}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      {assignOpen && (
                        <NoovaListMenu className="absolute left-0 top-full z-20 mt-1.5 min-w-[200px] lg:right-0 lg:left-auto">
                          <NoovaListMenuItem
                            active={detail?.handoff_mode !== "human"}
                            onClick={() => assignConversation("ai")}
                          >
                            <span className="flex items-center gap-2.5">
                              <Bot className="h-4 w-4 text-[#5b5bf6]" />
                              Agente (IA)
                            </span>
                          </NoovaListMenuItem>
                          <NoovaListMenuItem
                            active={
                              detail?.handoff_mode === "human" &&
                              detail?.assigned_to === currentUserName
                            }
                            onClick={() => assignConversation("me")}
                          >
                            <span className="flex items-center gap-2.5">
                              <User className="h-4 w-4 text-[#67e8f9]" />
                              {currentUserName} (yo)
                            </span>
                          </NoovaListMenuItem>
                        </NoovaListMenu>
                      )}
                    </div>
                  )}
                  <ChannelBadge channel={detail?.channel ?? "web_test"} />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setDetail(null);
                      setConversationInUrl(null);
                    }}
                    className="hidden shrink-0 rounded-xl p-2 text-white/40 transition-colors hover:bg-white/[.06] hover:text-white lg:inline-flex"
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </header>

            {error && (
              <div className="mx-4 mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 lg:mx-6">
                {error}
              </div>
            )}

            {detail?.kind === "text" &&
              detail.channel === "whatsapp" &&
              detail.whatsapp_compliance_notice &&
              !showTemplateComposer && (
                <div
                  className={`mx-4 mt-2 rounded-lg px-3 py-1.5 text-xs lg:mx-6 ${
                    detail.whatsapp_session_open === false || detail.whatsapp_opted_out
                      ? "bg-amber-500/10 text-amber-200/80"
                      : "bg-emerald-500/10 text-emerald-200/80"
                  }`}
                >
                  {detail.whatsapp_compliance_notice}
                </div>
              )}

            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
            >
              {detailLoading && !detail ? (
                <div className="flex items-center justify-center py-20 text-white/40">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Cargando mensajes...
                </div>
              ) : detail ? (
                <TextThread
                  messages={detail.messages}
                  createdAt={detail.created_at}
                  onMediaPlaybackStart={handleMediaPlaybackStart}
                  onMediaPlaybackEnd={handleMediaPlaybackEnd}
                />
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {detail && (
              <footer className="border-t border-white/[.04] px-4 py-4 sm:px-6 sm:py-5">
                {canReply ? (
                  <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply();
                        }
                      }}
                      rows={2}
                      placeholder="Escribe como asesor humano..."
                      className="flex-1 resize-none rounded-2xl border border-white/[.08] bg-white/[.07] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#5b5bf6]/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="w-full shrink-0 rounded-2xl bg-[#5b5bf6] px-5 py-3 text-sm font-medium text-white disabled:opacity-40 sm:w-auto"
                    >
                      {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Enviar"}
                    </button>
                  </div>
                ) : showTemplateComposer ? (
                  waTemplates.length > 0 ? (
                    <InboxTemplateComposer
                      templates={waTemplates}
                      selectedTemplateId={selectedTemplateId}
                      onSelectTemplate={setSelectedTemplateId}
                      variableValues={templateVars}
                      onVariableChange={(i, v) => {
                        const next = [...templateVars];
                        next[i] = v;
                        setTemplateVars(next);
                      }}
                      previewText={templatePreview}
                      sending={sending}
                      onSend={sendTemplate}
                      canSend={canSendTemplate}
                    />
                  ) : (
                    <div className="mx-auto flex max-w-lg flex-col items-stretch gap-2.5 rounded-xl bg-zinc-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-white/60">
                        <span className="font-medium text-white/80">Ventana de 24 h cerrada.</span>{" "}
                        Crea una plantilla para recontactar.
                      </p>
                      <Link
                        href="/dashboard/canales/whatsapp/plantillas/nueva"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
                      >
                        Crear plantilla
                      </Link>
                    </div>
                  )
                ) : (
                  <p className="text-center text-sm text-white/35">
                    {offline
                      ? "Activa Online para responder conversaciones."
                      : detail.kind === "text" &&
                          detail.channel === "whatsapp" &&
                          detail.whatsapp_opted_out
                        ? "Contacto dado de baja. Espera a que escriba de nuevo para reabrir la conversación."
                        : detail.kind === "text" &&
                            detail.channel === "whatsapp" &&
                            detail.whatsapp_session_open === false
                          ? detail.handoff_mode === "human" && detail.assigned_to
                            ? "Selecciona una plantilla aprobada arriba."
                            : "Asigna la conversación a ti para enviar una plantilla aprobada."
                          : detail.handoff_mode === "human" && !detail.assigned_to
                            ? "Asigna la conversación a ti para habilitar el chat humano."
                            : "Asigna la conversación a ti (arriba) para tomar el control y responder al visitante."}
                  </p>
                )}
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TextThread({
  messages,
  createdAt,
  onMediaPlaybackStart,
  onMediaPlaybackEnd
}: {
  messages: TextChatMessage[];
  createdAt: string;
  onMediaPlaybackStart?: () => void;
  onMediaPlaybackEnd?: () => void;
}) {
  if (messages.length === 0) {
    return <p className="py-10 text-center text-sm text-white/35">Sin mensajes en esta conversación.</p>;
  }

  const dateLabel = isToday(createdAt) ? "Hoy" : new Date(createdAt).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return (
    <div className="mx-auto max-w-3xl space-y-1">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-px flex-1 bg-white/[.06]" />
        <span className="text-xs font-medium uppercase tracking-widest text-white/25">
          {dateLabel}
        </span>
        <div className="h-px flex-1 bg-white/[.06]" />
      </div>

      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const isHuman = msg.role === "human";
        const prev = messages[i - 1];
        const sameSender = prev?.role === msg.role;
        const gap = sameSender ? "mt-1.5" : "mt-5";

        const bubbleClass = isUser
          ? "bg-zinc-600 text-white"
          : isHuman
            ? "bg-zinc-700 text-white"
            : "bg-zinc-950 text-white/90";
        const isAudioOnly = msg.media_type === "audio" && !msg.content.trim();

        return (
          <div
            key={inboxMessageStableKey(msg)}
            className={`flex ${gap} ${isUser ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`group relative rounded-2xl px-4 py-3 ${bubbleClass} ${
                isAudioOnly ? "min-w-[min(100%,280px)] max-w-[min(100%,320px)]" : "max-w-[78%]"
              }`}
            >
              {!isUser && (
                <span className="mb-1.5 block text-[11px] font-medium text-white/50">
                  {isHuman ? "Asesor" : "IA"}
                </span>
              )}
              {isUser && msg.media_label && msg.media_type !== "audio" && (
                <span className="mb-1.5 block text-[11px] font-medium text-white/55">
                  {msg.media_label}
                </span>
              )}
              <InboxMessageBody
                msg={msg}
                variant={isUser ? "user" : isHuman ? "human" : "ai"}
                onMediaPlaybackStart={onMediaPlaybackStart}
                onMediaPlaybackEnd={onMediaPlaybackEnd}
              />
              {msg.content.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              ) : null}
              <time className="mt-2 block text-[10px] text-white/35">
                {formatInboxMessageTime(msg.created_at)}
              </time>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InboxMessageBody({
  msg,
  variant = "ai",
  onMediaPlaybackStart,
  onMediaPlaybackEnd
}: {
  msg: TextChatMessage;
  variant?: "user" | "human" | "ai";
  onMediaPlaybackStart?: () => void;
  onMediaPlaybackEnd?: () => void;
}) {
  const url = msg.media_url?.trim();
  const type = msg.media_type;
  const embedBg =
    variant === "user"
      ? "bg-zinc-500 text-white/90"
      : variant === "human"
        ? "bg-zinc-600 text-white/90"
        : "bg-zinc-900 text-white/80";

  if (type === "video" && !url) {
    return (
      <div className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${embedBg}`}>
        <Film className="h-4 w-4 shrink-0 opacity-70" />
        Archivo de video recibido
      </div>
    );
  }

  if (!url) return null;

  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={msg.media_label ?? "Imagen"}
          className="max-h-64 w-full rounded-xl object-contain bg-black/25"
        />
      </a>
    );
  }

  if (type === "audio") {
    return (
      <InboxAudioPlayer
        src={url}
        onPlaybackStart={onMediaPlaybackStart}
        onPlaybackEnd={onMediaPlaybackEnd}
      />
    );
  }

  if (type === "video") {
    return (
      <div className={`mb-2 overflow-hidden rounded-xl ${embedBg}`}>
        <video
          controls
          preload="metadata"
          src={url}
          className="max-h-56 w-full bg-black/30"
        />
        <div className="flex items-center gap-2 px-3 py-2 text-xs opacity-80">
          <Film className="h-4 w-4 shrink-0" />
          <span>Archivo de video recibido</span>
        </div>
      </div>
    );
  }

  if (type === "document") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:opacity-90 ${embedBg}`}
      >
        <FileText className="h-4 w-4 shrink-0" />
        Abrir documento
      </a>
    );
  }

  return null;
}

const InboxAudioPlayer = memo(function InboxAudioPlayer({
  src,
  onPlaybackStart,
  onPlaybackEnd
}: {
  src: string;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}) {
  const playingRef = useRef(false);

  const handlePlay = () => {
    if (playingRef.current) return;
    playingRef.current = true;
    onPlaybackStart?.();
  };

  const handleStop = () => {
    if (!playingRef.current) return;
    playingRef.current = false;
    onPlaybackEnd?.();
  };

  return (
    <div className="mb-1 w-full min-w-[220px] overflow-visible">
      <audio
        controls
        preload="metadata"
        src={src}
        onPlay={handlePlay}
        onPause={handleStop}
        onEnded={handleStop}
        className="block h-11 w-full min-w-[220px] max-w-full"
      />
    </div>
  );
});

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando inbox…
        </div>
      }
    >
      <InboxPageInner />
    </Suspense>
  );
}
