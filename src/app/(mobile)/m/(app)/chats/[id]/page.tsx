"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import type { InboxTextDetail } from "@/types/inbox";
import type { TextChatMessage } from "@/types/text-agent-conversation";
import {
  BackIcon,
  CloseIcon,
  ChevronDownIcon,
  SendIcon,
  AttachIcon,
  UndoIcon,
  WhatsAppIcon,
  MiLinkIcon,
  ChannelGenericIcon
} from "../../../icons";
import { formatDayLabel, formatMsgTime, isSameDay } from "../../../format";
import { AppLoader } from "../../../AppLoader";

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "whatsapp") return <WhatsAppIcon className="channel" />;
  if (channel === "web_widget") return <MiLinkIcon className="channel" />;
  return <ChannelGenericIcon className="channel" />;
}

function channelClass(channel: string): string {
  if (channel === "whatsapp") return "wa";
  if (channel === "web_widget") return "milink";
  return "other";
}

function messageLabel(msg: TextChatMessage, assignedTo: string | null): string {
  if (msg.role === "human") return assignedTo || "Agente";
  return "IA";
}

/* Multimedia del mensaje — mismo comportamiento que la versión de escritorio
   (src/app/dashboard/inbox/page.tsx): imagen ampliable, audio y video con
   controles nativos, documento como enlace. media_url viene ya firmada por
   GET /api/inbox?id=. */
function MessageMedia({ msg }: { msg: TextChatMessage }) {
  const url = msg.media_url?.trim();
  const type = msg.media_type;
  if (!type || type === "text") return null;

  if (type === "video" && !url) {
    return <div className="media-note">Archivo de video recibido</div>;
  }
  if (!url) return null;

  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="media-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={msg.media_label ?? "Imagen"} />
      </a>
    );
  }
  if (type === "audio") {
    return <audio controls preload="metadata" src={url} className="media-audio" />;
  }
  if (type === "video") {
    return <video controls preload="metadata" src={url} className="media-video" />;
  }
  if (type === "document") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="media-doc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        {msg.media_label?.trim() || "Abrir documento"}
      </a>
    );
  }
  return null;
}

export default function MobileConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [detail, setDetail] = useState<InboxTextDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigningTo, setAssigningTo] = useState<"me" | "ai" | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const lastMsgCount = useRef(0);
  // GET /api/inbox?id= vuelve a firmar media_url en cada poll (token nuevo,
  // misma media) — si se lo pasamos tal cual a <audio>/<video>, el src cambia
  // cada 2s y el navegador reinicia la reproducción a la mitad. La firma dura
  // 1h, así que basta con quedarse con la primera URL vista por mensaje.
  const mediaUrlCache = useRef<Map<string, string>>(new Map());

  function stableMediaUrl(key: string, freshUrl: string | null | undefined): string | undefined {
    if (!freshUrl) return undefined;
    const cached = mediaUrlCache.current.get(key);
    if (cached) return cached;
    mediaUrlCache.current.set(key, freshUrl);
    return freshUrl;
  }

  const load = useCallback(
    async (silent = false) => {
      if (!id) return;
      try {
        const res = await authFetch(`/api/inbox?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setDetail(data.detail ?? null);
        setError(null);
      } catch {
        if (!silent) setError("No se pudo cargar la conversación.");
      }
    },
    [id]
  );

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    const count = detail?.messages?.length ?? 0;
    if (count !== lastMsgCount.current && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
    lastMsgCount.current = count;
  }, [detail?.messages?.length]);

  async function assign(to: "me" | "ai") {
    if (!id) return;
    setAssigningTo(to);
    try {
      const res = await authFetch("/api/inbox", {
        method: "PATCH",
        body: JSON.stringify({ conversation_id: id, assign_to: to })
      });
      if (res.ok) await load(true);
    } finally {
      setAssigningTo(null);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !id) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await authFetch("/api/inbox/reply", {
        method: "POST",
        body: JSON.stringify({ conversation_id: id, content })
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "No se pudo enviar el mensaje.");
        return;
      }
      setDraft("");
      await load(true);
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className="nv-m-onboarding" style={{ flex: 1 }}>
        <div className="onb-center">
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>{error}</p>
          <button type="button" className="btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={() => router.push("/m/chats")}>
            Volver a Chats
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="nv-m-chat-mode" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div className="loading-block">
          <AppLoader />
        </div>
      </div>
    );
  }

  const isHuman = detail.handoff_mode === "human";
  const canReply = isHuman && Boolean(detail.assigned_to);

  return (
    <div className="nv-m-chat-mode" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="cv-head">
        <div className="cv-head-row">
          <button className="back-btn" aria-label="Volver a chats" onClick={() => router.push("/m/chats")}>
            <BackIcon />
          </button>
          <div className="cv-id">
            <div className="cv-title">{detail.display_title}</div>
            <div className="cv-sub">
              {detail.channel_label} · {detail.agent_name}
            </div>
          </div>
          <button className="cv-x" aria-label="Cerrar conversación" onClick={() => router.push("/m/chats")}>
            <CloseIcon />
          </button>
        </div>
        <div className="cv-chips">
          <span className="chip state">
            {isHuman ? detail.assigned_to || "Asignada" : "IA"}
            <ChevronDownIcon />
          </span>
          <span className={`chip ${channelClass(detail.channel)}`}>
            <ChannelIcon channel={detail.channel} />
            {detail.channel_label}
          </span>
        </div>
      </div>

      <div className="thread" ref={threadRef}>
        {detail.messages.map((msg, i, arr) => {
          const prev = arr[i - 1];
          const showDaySep = !prev || !isSameDay(prev.created_at, msg.created_at);
          const isVisitor = msg.role === "user";
          const msgKey = `${msg.created_at}-${i}`;
          const msg2 = msg.media_url ? { ...msg, media_url: stableMediaUrl(msgKey, msg.media_url) } : msg;
          return (
            <div key={msgKey}>
              {showDaySep ? (
                <div className="day-sep">
                  <span>{formatDayLabel(msg.created_at)}</span>
                </div>
              ) : null}
              <div className={`msg ${isVisitor ? "visitor" : "agent"}`}>
                {isVisitor ? (
                  <div className="vbubble">
                    {msg.media_url && msg.media_label && msg.media_type !== "audio" && msg.media_type !== "document" ? (
                      <span className="media-label">{msg.media_label}</span>
                    ) : null}
                    <MessageMedia msg={msg2} />
                    {msg.content.trim()
                      ? msg.content
                      : !msg.media_url
                        ? (msg.media_label ?? "Adjunto")
                        : null}
                  </div>
                ) : (
                  <>
                    <div className="agent-label">{messageLabel(msg, detail.assigned_to)}</div>
                    <MessageMedia msg={msg2} />
                    {msg.content.trim() ? (
                      <div className="agent-text">{msg.content}</div>
                    ) : !msg.media_url ? (
                      <div className="agent-text">{msg.media_label ?? "Adjunto"}</div>
                    ) : null}
                  </>
                )}
                <div className="msg-time">{formatMsgTime(msg.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cv-footer">
        {sendError ? <p className="form-error">{sendError}</p> : null}
        {canReply ? (
          <>
            <div className="composer-top">
              <button type="button" className="return-ia" onClick={() => assign("ai")} disabled={assigningTo !== null}>
                <UndoIcon />
                Devolver a la IA
              </button>
            </div>
            <form className="composer-inner" onSubmit={handleSend}>
              <button type="button" className="ic-btn" aria-label="Adjuntar" disabled>
                <AttachIcon />
              </button>
              <textarea
                rows={1}
                placeholder="Escribe un mensaje"
                aria-label="Mensaje"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as unknown as FormEvent);
                  }
                }}
              />
              <button type="submit" className="send" aria-label="Enviar" disabled={sending || !draft.trim()}>
                {sending ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <SendIcon />}
              </button>
            </form>
          </>
        ) : (
          <div className="handoff-banner">
            <p>Asigna la conversación a ti (arriba) para tomar el control y responder al visitante.</p>
            <button type="button" className="assign-btn" onClick={() => assign("me")} disabled={assigningTo !== null}>
              Asignármela
            </button>
          </div>
        )}
      </div>

      {assigningTo ? (
        <div className="loading-overlay">
          <AppLoader />
        </div>
      ) : null}
    </div>
  );
}
