"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import type { InboxFilter, InboxListItem } from "@/types/inbox";
import { ArchiveIcon, SearchIcon, WhatsAppIcon, MiLinkIcon, ChannelGenericIcon } from "../../../icons";
import { formatListTime, initialsOf } from "../../../format";
import { AppLoader } from "../../../AppLoader";
import { usePullToRefresh } from "../../../usePullToRefresh";
import { ChatActionsSheet } from "../../../ChatActionsSheet";

interface ChatAssignee {
  user_id: string;
  name: string;
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "whatsapp") return <WhatsAppIcon />;
  if (channel === "web_widget") return <MiLinkIcon />;
  return <ChannelGenericIcon />;
}

function channelClass(channel: string): string {
  if (channel === "whatsapp") return "wa";
  if (channel === "web_widget") return "milink";
  return "other";
}

export default function MobileChatsPage() {
  const [items, setItems] = useState<InboxListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [currentUserName, setCurrentUserName] = useState("Usuario");
  const [assignees, setAssignees] = useState<ChatAssignee[]>([]);
  const [actionsItem, setActionsItem] = useState<InboxListItem | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await authFetch(`/api/inbox?filter=${filter}`);
      if (res.status === 403) {
        setError("No tienes acceso al módulo de Chats.");
        setItems([]);
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.current_user_name) setCurrentUserName(data.current_user_name);
      setError(null);
    } catch {
      if (!silent) setError("No se pudo cargar la lista de chats.");
    }
  }, [filter]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => {
      if (document.hidden) return;
      load(true);
    }, 4000);
    const onVisible = () => {
      if (!document.hidden) load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/inbox/assignees");
        const data = await res.json();
        if (res.ok) setAssignees(data.assignees ?? []);
      } catch {
        /* silencioso: el listado de asesores en el menú de acciones solo queda vacío */
      }
    })();
  }, []);

  const archiveConversation = useCallback(async (id: string, archived: boolean) => {
    try {
      const res = await authFetch("/api/inbox", {
        method: "PATCH",
        body: JSON.stringify({ conversation_id: id, archived })
      });
      if (res.ok) await load(true);
    } finally {
      setActionsItem(null);
    }
  }, [load]);

  const assignConversation = useCallback(async (id: string, value: "ai" | "me" | string) => {
    try {
      const res = await authFetch("/api/inbox", {
        method: "PATCH",
        body: JSON.stringify({ conversation_id: id, assign_to: value })
      });
      if (res.ok) await load(true);
    } finally {
      setActionsItem(null);
    }
  }, [load]);

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

  const handleItemTouchStart = useCallback((e: ReactTouchEvent, item: InboxListItem) => {
    const touch = e.touches[0];
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      longPressTimerRef.current = null;
      if (navigator.vibrate) navigator.vibrate(10);
      setActionsItem(item);
    }, 500);
  }, []);

  const handleItemTouchMove = useCallback((e: ReactTouchEvent) => {
    const start = longPressStartRef.current;
    if (!start) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const filtered = (items ?? []).filter((it) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return it.display_title.toLowerCase().includes(q) || it.preview.toLowerCase().includes(q);
  });

  const unreadTotal = (items ?? []).reduce((sum, it) => sum + (it.unread_count || 0), 0);
  const { scrollRef, pull, refreshing, handlers } = usePullToRefresh(() => load(true));

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (items === null) return;
    if (unreadTotal > 0) nav.setAppBadge?.(unreadTotal).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [items, unreadTotal]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="app-head">
        <div className="head-row">
          <div>
            <p className="kicker">Noova360</p>
            <h1>{filter === "archived" ? "Archivadas" : "Chats"}</h1>
          </div>
          <div className="head-actions">
            {items && unreadTotal > 0 && filter !== "archived" ? (
              <span className="head-sub">{unreadTotal} sin leer</span>
            ) : null}
            <button
              type="button"
              className={`filter-btn${filter === "archived" ? " active" : ""}`}
              aria-label={filter === "archived" ? "Ver bandeja" : "Ver archivadas"}
              onClick={() => setFilter(f => (f === "archived" ? "all" : "archived"))}
            >
              <ArchiveIcon />
            </button>
          </div>
        </div>
        <div className="search">
          <SearchIcon />
          <input
            placeholder="Buscar"
            aria-label="Buscar conversaciones"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="nv-m-scroll" ref={scrollRef} {...handlers}>
        <div className="pull-indicator" style={{ height: pull }}>
          <span className="spinner" />
        </div>
        <div className="chat-list">
          {items === null ? (
            <div className="loading-block">
              <AppLoader />
            </div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {query
                ? "No hay conversaciones que coincidan con tu búsqueda."
                : filter === "archived"
                  ? "No hay conversaciones archivadas."
                  : "No hay conversaciones todavía."}
            </div>
          ) : (
            filtered.map((it, i) => {
              const isHuman = it.handoff_mode === "human";
              const handlerName = isHuman
                ? (it.assigned_to as string) || "Esperando asesor"
                : it.agent_name || "IA";
              return (
                <div key={it.id}>
                  <Link
                    href={`/m/chats/${it.id}`}
                    className={`conv${it.unread_count > 0 ? " unread" : ""}`}
                    onClick={e => {
                      if (longPressFiredRef.current) {
                        longPressFiredRef.current = false;
                        e.preventDefault();
                      }
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      setActionsItem(it);
                    }}
                    onTouchStart={e => handleItemTouchStart(e, it)}
                    onTouchMove={handleItemTouchMove}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                    style={{ WebkitTouchCallout: "none", userSelect: "none" }}
                  >
                    <span className="conv-top">
                      <span className="conv-name">{it.display_title}</span>
                      <span className="conv-time">{formatListTime(it.updated_at)}</span>
                    </span>
                    <span className="conv-preview-row">
                      <span className="conv-preview">{it.preview || "—"}</span>
                      {it.unread_count > 0 ? <span className="unread-badge">{it.unread_count}</span> : null}
                    </span>
                    <span className="conv-chips">
                      <span className={`chn ${channelClass(it.channel)}`}>
                        <ChannelIcon channel={it.channel} />
                        {it.channel_label}
                      </span>
                      <span className="agent-chip">
                        <span className="mini-av">{initialsOf(handlerName)}</span>
                        <span className="name">{handlerName}</span>
                      </span>
                    </span>
                  </Link>
                  {i < filtered.length - 1 ? <div className="list-divider" /> : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {actionsItem ? (
        <ChatActionsSheet
          item={actionsItem}
          currentUserName={currentUserName}
          assignees={assignees}
          onArchive={archived => archiveConversation(actionsItem.id, archived)}
          onAssign={value => assignConversation(actionsItem.id, value)}
          onClose={() => setActionsItem(null)}
        />
      ) : null}
    </div>
  );
}
