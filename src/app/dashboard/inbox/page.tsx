"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
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
import {
  countFilledTemplateVariables,
  resolveTemplateVariableValues
} from "@/lib/whatsapp/template-variable-context";
import { InboxTemplateComposer } from "@/components/inbox/InboxTemplateComposer";
import { NoovaListMenu, NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { Badge } from "@/components/ui/Badge";
import { InfoBox } from "@/components/ui/InfoBox";
import { inputSearch } from "@/lib/brand-ui";

type AssignValue = "ai" | "me" | string;

interface InboxAssignee {
  user_id: string;
  name: string;
}

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
  return (
    <Badge variant={style.variant} icon={style.icon}>
      {style.label}
    </Badge>
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
  const [assignees, setAssignees] = useState<InboxAssignee[]>([]);
  const [reply, setReply] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: InboxListItem } | null>(null);
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

  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const handleItemTouchStart = useCallback(
    (e: React.TouchEvent, item: InboxListItem) => {
      const touch = e.touches[0];
      longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        longPressTimerRef.current = null;
        setContextMenu({ x: touch.clientX, y: touch.clientY, item });
      }, 500);
    },
    []
  );

  const handleItemTouchMove = useCallback((e: React.TouchEvent) => {
    const start = longPressStartRef.current;
    if (!start) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

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
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/inbox/assignees", { headers });
        const data = await res.json();
        if (res.ok) setAssignees(data.assignees ?? []);
      } catch {
        /* silencioso: el selector de "Asignar a" solo pierde las opciones de compañeros */
      }
    })();
  }, []);

  // Antes: 2000ms fijo, sin pausar en pestaña oculta — con varios agentes con el inbox
  // abierto todo el día esto multiplicaba requests (y validaciones de auth en el server, que
  // pegan a la API de Supabase, no son locales) de forma innecesaria. 4000ms + pausa en
  // pestaña oculta + refresco inmediato al volver a foco mantiene la sensación de "vivo" con
  // una fracción del tráfico.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      loadList(true);
    }, 4000);
    const onVisible = () => {
      if (!document.hidden) loadList(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const timer = window.setInterval(() => {
      if (document.hidden || mediaPlaybackCountRef.current > 0) return;
      void loadDetail(selectedId, true);
    }, 4000);
    const onVisible = () => {
      if (!document.hidden && mediaPlaybackCountRef.current === 0) void loadDetail(selectedId, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
    const ctx = detail?.kind === "text" ? detail.template_context : null;
    setTemplateVars(resolveTemplateVariableValues(tpl.variable_labels, ctx));
  }, [selectedTemplateId, waTemplates, detail]);

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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

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

  const assignConversation = async (value: AssignValue, targetId?: string) => {
    const id = targetId ?? selectedId;
    if (!id) return;
    setAssignOpen(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: id,
          assign_to: value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo asignar");
        return;
      }
      if (id === selectedId) await loadDetail(id);
      await loadList(true);
    } catch {
      setError("Error de red al asignar");
    }
  };

  const archiveConversation = async (archived: boolean, targetId?: string) => {
    const id = targetId ?? selectedId;
    if (!id) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: id, archived })
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        setError(data.error || "No se pudo archivar la conversación");
        return;
      }
      setError("");
      if (id === selectedId) {
        setDetail(prev =>
          prev && prev.kind === "text"
            ? { ...prev, archived_at: archived ? new Date().toISOString() : null }
            : prev
        );
      }
      await loadList(true);
    } catch {
      setError("Error de red al archivar");
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
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        setError(data.error || `No se pudo enviar (${res.status})`);
        return;
      }
      setReply("");
      stickToBottomRef.current = true;
      await loadDetail(selectedId);
      await loadList();
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red al enviar");
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
    !detail?.archived_at &&
    (detail.kind !== "text" ||
      detail.channel !== "whatsapp" ||
      (detail.whatsapp_session_open !== false && !detail.whatsapp_opted_out));

  const assignLabel =
    detail?.handoff_mode !== "human"
      ? "IA"
      : detail?.assigned_to
        ? detail.assigned_to
        : "Esperando asesor";

  const detailTitle =
    detail?.display_title ??
    (detail
      ? formatInboxDisplayTitle(detail.contact_label, detail.channel, detail.id)
      : "Cargando...");

  const tabs: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "mine", label: "Mías" },
    { id: "unassigned", label: "Sin asignar" },
    { id: "archived", label: "Archivadas" }
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
              className={`relative h-6 w-11 rounded-full transition-colors ${offline ? "bg-white/10" : "bg-[#0f7eff]"}`}
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
              className={`${inputSearch} rounded-xl`}
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
                  ? "bg-[#0f7eff] text-white"
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
              {filter === "archived"
                ? "No hay conversaciones archivadas."
                : "No hay conversaciones todavía. Aparecerán aquí los chats del micrositio y las pruebas de agentes de texto."}
            </p>
          ) : filteredItems.length === 0 ? null : (
            filteredItems.map(item => {
              const active = selectedId === item.id;
              const hasUnread = item.unread_count > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (longPressFiredRef.current) {
                      longPressFiredRef.current = false;
                      return;
                    }
                    selectItem(item);
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, item });
                  }}
                  onTouchStart={e => handleItemTouchStart(e, item)}
                  onTouchMove={handleItemTouchMove}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                  className={`w-full select-none border-b border-white/[.04] px-5 py-3.5 text-left transition-colors ${
                    active
                      ? "bg-white/[.08]"
                      : hasUnread
                        ? "bg-[#0f7eff]/[.12] hover:bg-[#0f7eff]/[.16]"
                        : "hover:bg-white/[.04]"
                  } ${hasUnread ? "border-l-2 border-l-[#0f7eff]" : "border-l-2 border-l-transparent"}`}
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
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0f7eff] px-1.5 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(15,126,255,0.5)]">
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
        className={`flex min-w-0 flex-1 flex-col bg-[var(--nv-bg-chat)] ${
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
                          {!detail.agent_human_only && (
                          <NoovaListMenuItem
                            active={detail?.handoff_mode !== "human"}
                            onClick={() => assignConversation("ai")}
                          >
                            <span className="flex items-center gap-2.5">
                              <Bot className="h-4 w-4 text-[#0f7eff]" />
                              Agente (IA)
                            </span>
                          </NoovaListMenuItem>
                          )}
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
                          {assignees
                            .filter(a => a.name !== currentUserName)
                            .map(a => (
                              <NoovaListMenuItem
                                key={a.user_id}
                                active={
                                  detail?.handoff_mode === "human" &&
                                  detail?.assigned_to === a.name
                                }
                                onClick={() => assignConversation(a.name)}
                              >
                                <span className="flex items-center gap-2.5">
                                  <User className="h-4 w-4 text-white/50" />
                                  {a.name}
                                </span>
                              </NoovaListMenuItem>
                            ))}
                        </NoovaListMenu>
                      )}
                    </div>
                  )}
                  <ChannelBadge channel={detail?.channel ?? "web_test"} />
                  {detail?.kind === "text" && (
                    <button
                      type="button"
                      onClick={() => archiveConversation(!detail.archived_at)}
                      className="shrink-0 rounded-xl border border-white/[.08] bg-white/[.08] p-2.5 text-white/50 transition-colors hover:text-white"
                      aria-label={detail.archived_at ? "Desarchivar" : "Archivar"}
                      title={detail.archived_at ? "Desarchivar conversación" : "Archivar conversación"}
                    >
                      {detail.archived_at ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  )}
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
                <InfoBox
                  layout="row"
                  variant={
                    detail.whatsapp_session_open === false || detail.whatsapp_opted_out
                      ? "warning"
                      : "success"
                  }
                  className="mx-4 mt-2 lg:mx-6"
                >
                  {detail.whatsapp_compliance_notice}
                </InfoBox>
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
                      className="flex-1 resize-none rounded-2xl border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] px-4 py-3 text-sm text-[var(--nv-text)] placeholder-[var(--nv-text-faint)] focus:border-[#0f7eff]/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="w-full shrink-0 rounded-2xl bg-[#0f7eff] px-5 py-3 text-sm font-medium text-white disabled:opacity-40 sm:w-auto"
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
                      onAutofillFromContact={() => {
                        const tpl = waTemplates.find(t => t.id === selectedTemplateId);
                        if (!tpl || detail?.kind !== "text") return;
                        setTemplateVars(
                          resolveTemplateVariableValues(tpl.variable_labels, detail.template_context)
                        );
                      }}
                      autofilledCount={
                        selectedTemplate
                          ? countFilledTemplateVariables(
                              resolveTemplateVariableValues(
                                selectedTemplate.variable_labels,
                                detail?.kind === "text" ? detail.template_context : null
                              )
                            )
                          : 0
                      }
                      previewText={templatePreview}
                      sending={sending}
                      onSend={sendTemplate}
                      canSend={canSendTemplate}
                    />
                  ) : (
                    <div className="mx-auto flex max-w-lg flex-col items-stretch gap-2.5 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-white/60">
                        <span className="font-medium text-white/80">Ventana de 24 h cerrada.</span>{" "}
                        No hay plantillas aprobadas para esta línea. Aprueba una en Canales → WhatsApp →
                        Plantillas (debe estar ligada a este número).
                      </p>
                      <Link
                        href="/dashboard/canales/whatsapp/plantillas"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90"
                      >
                        Ver plantillas
                      </Link>
                    </div>
                  )
                ) : (
                  <p className="text-center text-sm text-white/35">
                    {detail.kind === "text" && detail.archived_at
                      ? "Conversación archivada. Desarchívala para responder."
                      : offline
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

      {contextMenu &&
        (() => {
          const otherAssignees = assignees.filter(a => a.name !== currentUserName);
          const width = 176;
          const rowHeight = 38;
          const estimatedHeight =
            8 /* padding vertical del contenedor */ +
            rowHeight /* archivar */ +
            9 /* separador */ +
            18 /* etiqueta "Asignar a" */ +
            rowHeight * (2 + otherAssignees.length);
          const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - width - 8));
          const top = Math.max(
            8,
            Math.min(contextMenu.y, window.innerHeight - estimatedHeight - 8)
          );

          return createPortal(
            <div
              className="fixed z-50"
              style={{ top, left, width, maxHeight: window.innerHeight - 16 }}
            >
              <NoovaListMenu className="max-h-full overflow-y-auto">
                <NoovaListMenuItem
                  onClick={() => {
                    archiveConversation(!contextMenu.item.archived_at, contextMenu.item.id);
                    setContextMenu(null);
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    {contextMenu.item.archived_at ? (
                      <ArchiveRestore className="h-4 w-4 shrink-0" />
                    ) : (
                      <Archive className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">
                      {contextMenu.item.archived_at ? "Desarchivar" : "Archivar"}
                    </span>
                  </span>
                </NoovaListMenuItem>
                <div className="my-1 h-px bg-white/[.06]" />
                <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/30">
                  Asignar a
                </div>
                <NoovaListMenuItem
                  onClick={() => {
                    assignConversation("ai", contextMenu.item.id);
                    setContextMenu(null);
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Bot className="h-4 w-4 shrink-0 text-[#0f7eff]" />
                    <span className="truncate">Agente (IA)</span>
                  </span>
                </NoovaListMenuItem>
                <NoovaListMenuItem
                  onClick={() => {
                    assignConversation("me", contextMenu.item.id);
                    setContextMenu(null);
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <User className="h-4 w-4 shrink-0 text-[#67e8f9]" />
                    <span className="truncate">Mí ({currentUserName})</span>
                  </span>
                </NoovaListMenuItem>
                {otherAssignees.map(a => (
                  <NoovaListMenuItem
                    key={a.user_id}
                    onClick={() => {
                      assignConversation(a.name, contextMenu.item.id);
                      setContextMenu(null);
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <User className="h-4 w-4 shrink-0 text-white/50" />
                      <span className="truncate">{a.name}</span>
                    </span>
                  </NoovaListMenuItem>
                ))}
              </NoovaListMenu>
            </div>,
            document.body
          );
        })()}
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
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setDateLabel(
      isToday(createdAt)
        ? "Hoy"
        : new Date(createdAt).toLocaleDateString("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long"
          })
    );
  }, [createdAt]);

  if (messages.length === 0) {
    return <p className="py-10 text-center text-sm text-white/35">Sin mensajes en esta conversación.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-1">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-px flex-1 bg-white/[.06]" />
        <span className="text-xs font-medium uppercase tracking-widest text-white/25" suppressHydrationWarning>
          {dateLabel || "…"}
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
          ? "inbox-bubble-user"
          : isHuman
            ? "inbox-bubble-human"
            : "inbox-bubble-ai";
        const isAudioOnly = msg.media_type === "audio" && !msg.content.trim();

        return (
          <div
            key={inboxMessageStableKey(msg)}
            className={`flex ${gap} ${isUser ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`group relative rounded-2xl ${bubbleClass} ${
                isUser ? "px-3.5 py-2" : "px-4 py-3"
              } ${
                isAudioOnly ? "min-w-[min(100%,280px)] max-w-[min(100%,320px)]" : "max-w-[78%]"
              }`}
            >
              {!isUser && (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
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
      ? "inbox-bubble-user"
      : variant === "human"
        ? "inbox-bubble-human"
        : "inbox-bubble-ai";

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
