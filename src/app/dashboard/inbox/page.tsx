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
  formatInboxMessageTime,
  formatInboxTime,
  inboxMessageLabel,
  isToday
} from "@/lib/inbox-utils";
import type { InboxFilter, InboxListItem, InboxTextDetail } from "@/types/inbox";
import type { TextChatMessage } from "@/types/text-agent-conversation";

type AssignValue = "ai" | "me";

function AgentAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-gray-300">
      {initial}
    </span>
  );
}

function ChannelBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[.04] px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
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

  const tabs: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "mine", label: "Mis conversaciones" },
    { id: "unassigned", label: "Sin asignar" }
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-noova-main text-gray-100">
      {/* Lista */}
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-white/[.08] bg-noova-surface">
        <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
          <h1 className="text-sm font-semibold text-white">Inbox</h1>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-500">
            <span>{offline ? "Offline" : "Online"}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!offline}
              onClick={() => setOffline(v => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${offline ? "bg-white/10" : "bg-[#5b5bf6]"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${offline ? "left-0.5" : "left-[18px]"}`}
              />
            </button>
          </label>
        </div>

        <div className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full rounded-lg border border-white/[.08] bg-white/[.03] py-2 pl-8 pr-3 text-xs text-white placeholder:text-gray-600 focus:border-[#5b5bf6]/40 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={loadList}
            className="rounded-lg border border-white/[.08] bg-white/[.03] p-2 text-gray-500 hover:text-white"
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/[.08] bg-white/[.03] p-2 text-gray-500"
            aria-label="Filtros"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-white/[.06] px-3 py-2.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                filter === tab.id
                  ? "bg-[#5b5bf6] text-white"
                  : "bg-white/[.04] text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && !loading && (
            <div className="mx-3 mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
              {error}
            </div>
          )}
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando conversaciones...
            </div>
          ) : filteredItems.length === 0 && !error ? (
            <p className="px-4 py-10 text-center text-xs text-gray-600">
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
                  className={`w-full border-b border-white/[.04] px-4 py-3 text-left transition-colors ${
                    active ? "bg-white/[.06]" : "hover:bg-white/[.03]"
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-200">
                      {item.contact_label}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {formatInboxTime(item.updated_at)}
                    </span>
                  </div>
                  <p className="mb-2 line-clamp-2 text-sm leading-snug text-gray-300">
                    {item.preview}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <ChannelBadge label={item.channel_label} />
                      <AgentAvatar name={item.agent_name} />
                      <span className="text-[10px] text-gray-500">{item.agent_name}</span>
                    </div>
                    {item.unread_count > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/90 px-1 text-[10px] font-bold text-black">
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

      {/* Detalle */}
      <section className="flex min-w-0 flex-1 flex-col bg-noova-main">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-600">
            <MessageSquare className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Selecciona una conversación</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-600">
              Chats del micrositio y pruebas de agentes de texto aparecen en la lista.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-white/[.06] px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {detail?.contact_label ?? "Cargando..."}
                </p>
                {detail && (
                  <p className="text-[11px] text-gray-600">
                    {detail.channel_label}
                    {" · "}
                    {detail.agent_name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {detail?.kind === "text" && (
                  <div className="relative" ref={assignRef}>
                    <button
                      type="button"
                      onClick={() => setAssignOpen(v => !v)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[.06]"
                    >
                      {assignLabel}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </button>
                    {assignOpen && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-white/[.10] bg-noova-surface py-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => assignConversation("ai")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/[.06]"
                        >
                          <Bot className="h-3.5 w-3.5 text-[#5b5bf6]" />
                          Agente (IA)
                        </button>
                        <button
                          type="button"
                          onClick={() => assignConversation("me")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/[.06]"
                        >
                          <User className="h-3.5 w-3.5 text-emerald-400" />
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
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-white/[.06] hover:text-white"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {error && (
              <div className="mx-5 mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detailLoading && !detail ? (
                <div className="flex items-center justify-center py-20 text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando mensajes...
                </div>
              ) : detail ? (
                <TextThread messages={detail.messages} createdAt={detail.created_at} />
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {detail && (
              <footer className="border-t border-white/[.06] px-5 py-4">
                {canReply ? (
                  <div className="flex items-end gap-2">
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
                      className="flex-1 resize-none rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-[#5b5bf6]/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={!reply.trim() || sending}
                      className="rounded-xl bg-[#5b5bf6] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-600">
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
    return <p className="py-10 text-center text-xs text-gray-600">Sin mensajes en esta conversación.</p>;
  }

  const dateLabel = isToday(createdAt) ? "Hoy" : new Date(createdAt).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-gray-600">
        {dateLabel}
      </p>
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const label = inboxMessageLabel(msg.role);
        return (
          <div
            key={`${msg.created_at}-${i}`}
            className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}
          >
            <span className="mb-1 text-[10px] text-gray-600">{label}</span>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? "bg-[#3d4a2a] text-gray-100"
                  : msg.role === "human"
                    ? "bg-[#2a3d4a] text-gray-100"
                    : "bg-[#2a2a30] text-gray-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="mt-1.5 text-right text-[10px] opacity-50">
                {formatInboxMessageTime(msg.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
