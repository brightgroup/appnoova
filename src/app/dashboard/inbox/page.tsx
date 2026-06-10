"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Filter,
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
  isToday
} from "@/lib/inbox-utils";
import type { InboxFilter, InboxListItem, InboxTextDetail } from "@/types/inbox";
import type { TextChatMessage } from "@/types/text-agent-conversation";

type AssignValue = "ai" | "me";

function AgentAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/80">
      {initial}
    </span>
  );
}

function ChannelBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[.08] px-2 py-0.5 text-xs font-medium text-white/60">
      {label}
    </span>
  );
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const assignRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/inbox?filter=${filter}`, { headers });
      if (res.status === 404) {
        setError("El Inbox aún no está desplegado en este entorno. Usa localhost o haz deploy a producción.");
        setItems([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error ||
          (res.status === 503
            ? "Falta la migración 016_inbox_handoff en Supabase."
            : "Error al cargar inbox")
        );
        return;
      }
      setItems(data.items ?? []);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
    } catch {
      setError("Error de red al conectar con /api/inbox");
    } finally {
      setLoading(false);
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
      setDetail(loaded?.kind === "text" ? loaded : null);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
    } catch {
      if (!silent) setError("Error de red al cargar conversación");
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const timer = window.setInterval(() => loadDetail(selectedId, true), 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail]);

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
    setReply("");
    setAssignOpen(false);
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
      await loadDetail(selectedId);
      await loadList();
    } catch {
      setError("Error de red al enviar");
    }
    setSending(false);
  };

  const canReply =
    detail?.handoff_mode === "human" &&
    Boolean(detail?.assigned_to) &&
    !offline;

  const assignLabel =
    detail?.handoff_mode === "human" && detail?.assigned_to
      ? detail.assigned_to
      : "Asignar a";

  const detailTitle =
    detail?.display_title ??
    (detail
      ? formatInboxDisplayTitle(detail.contact_label, detail.channel, detail.id)
      : "Cargando...");

  const tabs: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "mine", label: "Mis conversaciones" },
    { id: "unassigned", label: "Sin asignar" }
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-noova-main text-white">
      {/* Bandeja — tono intermedio entre menú lateral y área de chat */}
      <aside className="flex w-[420px] shrink-0 flex-col border-r border-white/[.06] bg-noova-main">
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
            onClick={loadList}
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
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={`w-full border-b border-white/[.04] px-5 py-3.5 text-left transition-colors ${
                    active ? "bg-white/[.08]" : "hover:bg-white/[.04]"
                  }`}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-bold text-white">
                      {item.display_title}
                    </span>
                    <span className="shrink-0 text-xs text-white/40">
                      {formatInboxTime(item.updated_at)}
                    </span>
                  </div>
                  <p className="mb-2.5 line-clamp-2 text-sm leading-snug text-white/75">
                    {item.preview}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ChannelBadge label={item.channel_label} />
                      <AgentAvatar name={item.agent_name} />
                      <span className="text-xs text-white/50">{item.agent_name}</span>
                    </div>
                    {item.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5b5bf6] px-1.5 text-[11px] font-bold text-white">
                        {item.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conversación — mucho más oscura, diseño minimalista */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#030304]">
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
            <header className="flex items-center justify-between gap-4 border-b border-white/[.04] px-6 py-4">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">
                  {detailTitle}
                </p>
                {detail && (
                  <p className="mt-0.5 text-sm text-white/40">
                    {detail.channel_label}
                    {" · "}
                    {detail.agent_name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {detail?.kind === "text" && (
                  <div className="relative" ref={assignRef}>
                    <button
                      type="button"
                      onClick={() => setAssignOpen(v => !v)}
                      className="flex items-center gap-2 rounded-xl border border-white/[.10] bg-white/[.08] px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[.10]"
                    >
                      {assignLabel}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </button>
                    {assignOpen && (
                      <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-white/[.10] bg-noova-surface py-1 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => assignConversation("ai")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/[.06]"
                        >
                          <Bot className="h-4 w-4 text-[#5b5bf6]" />
                          Agente (IA)
                        </button>
                        <button
                          type="button"
                          onClick={() => assignConversation("me")}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/[.06]"
                        >
                          <User className="h-4 w-4 text-[#67e8f9]" />
                          {currentUserName} (yo)
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <ChannelBadge label={detail?.channel_label ?? "API"} />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/[.06] hover:text-white"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {error && (
              <div className="mx-6 mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {detailLoading && !detail ? (
                <div className="flex items-center justify-center py-20 text-white/40">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Cargando mensajes...
                </div>
              ) : detail ? (
                <TextThread messages={detail.messages} createdAt={detail.created_at} />
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {detail && (
              <footer className="border-t border-white/[.04] px-6 py-5">
                {canReply ? (
                  <div className="mx-auto flex max-w-3xl items-end gap-3">
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
                      className="rounded-2xl bg-[#5b5bf6] px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-sm text-white/35">
                    {offline
                      ? "Activa Online para responder conversaciones."
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
  createdAt
}: {
  messages: TextChatMessage[];
  createdAt: string;
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

        return (
          <div
            key={`${msg.created_at}-${i}`}
            className={`flex ${gap} ${isUser ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`group relative max-w-[78%] px-4 py-3 ${
                isUser
                  ? "rounded-2xl rounded-bl-md border border-[#5b5bf6]/25 bg-[#5b5bf6]/20 text-white"
                  : isHuman
                    ? "rounded-2xl rounded-br-md border border-[#67e8f9]/35 bg-[#67e8f9]/[.18] text-white/95"
                    : "rounded-2xl rounded-br-md border border-white/[.06] bg-white/[.07] text-white/90"
              }`}
            >
              {!isUser && (
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/30">
                  {isHuman ? "Asesor" : "IA"}
                </span>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              <time className="mt-2 block text-[10px] text-white/25">
                {formatInboxMessageTime(msg.created_at)}
              </time>
            </div>
          </div>
        );
      })}
    </div>
  );
}
