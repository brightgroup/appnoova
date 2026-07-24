"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import type { InboxListItem } from "@/types/inbox";
import { SearchIcon, WhatsAppIcon, MiLinkIcon, ChannelGenericIcon } from "../../../icons";
import { formatListTime, initialsOf } from "../../../format";
import { AppLoader } from "../../../AppLoader";
import { usePullToRefresh } from "../../../usePullToRefresh";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await authFetch("/api/inbox?filter=all");
      if (res.status === 403) {
        setError("No tienes acceso al módulo de Chats.");
        setItems([]);
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setError(null);
    } catch {
      if (!silent) setError("No se pudo cargar la lista de chats.");
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

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
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="app-head">
        <div className="head-row">
          <div>
            <p className="kicker">Noova360</p>
            <h1>Chats</h1>
          </div>
          {items && unreadTotal > 0 ? <span className="head-sub">{unreadTotal} sin leer</span> : null}
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
              {query ? "No hay conversaciones que coincidan con tu búsqueda." : "No hay conversaciones todavía."}
            </div>
          ) : (
            filtered.map((it, i) => {
              const isHuman = it.handoff_mode === "human";
              const handlerName = isHuman
                ? (it.assigned_to as string) || "Esperando asesor"
                : it.agent_name || "IA";
              return (
                <div key={it.id}>
                  <Link href={`/m/chats/${it.id}`} className={`conv${it.unread_count > 0 ? " unread" : ""}`}>
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
    </div>
  );
}
