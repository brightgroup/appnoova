"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Home, MessageCircle, Send, X, Loader2, MoreVertical } from "lucide-react";
import type { PublicMicrositeConfig } from "@/types/microsite";
import { WEB_EMBED_CHANNEL } from "@/lib/widget-channel";
import { resolveMicrositeIcon } from "@/lib/microsite-icons";
import { loadWidgetChat, saveWidgetChat, type WidgetMessage } from "@/lib/widget-storage";
import { playWidgetMessageSound } from "@/lib/widget-sound";
import { WidgetMessageAvatar } from "./WidgetMessageAvatar";

type TabId = "home" | "chat";

interface WebChatWidgetProps {
  config: PublicMicrositeConfig;
  /** Vista previa en la landing (/?) — permite widget en borrador */
  previewMode?: boolean;
}

function closeParentWidget(): void {
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage({ type: "noova-widget-close" }, "*");
  }
}

function enabledQuickActions(config: PublicMicrositeConfig) {
  return config.quickActions.filter(a => a.enabled && a.label.trim());
}

export default function WebChatWidget({ config, previewMode = false }: WebChatWidgetProps) {
  const [tab, setTab] = useState<TabId>("home");
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [serverConversationId, setServerConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [handoffMode, setHandoffMode] = useState<"ai" | "human">("ai");
  const [error, setError] = useState("");
  const showAiTyping = loading && handoffMode === "ai";
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const chatHydratedRef = useRef(false);

  const accent = config.accent || "#5b5bf6";
  const buttonColor = config.buttonColor || accent;
  const quickActions = enabledQuickActions(config);

  useEffect(() => {
    const stored = loadWidgetChat(config.slug);
    setMessages(stored.messages);
    setServerConversationId(stored.serverConversationId);
    if (stored.messages.length > 0) setTab("chat");
    prevCountRef.current = stored.messages.length;
    chatHydratedRef.current = true;
  }, [config.slug]);

  useEffect(() => {
    if (!chatHydratedRef.current) return;
    saveWidgetChat(config.slug, { messages, serverConversationId });
  }, [config.slug, messages, serverConversationId]);

  useEffect(() => {
    document.documentElement.style.setProperty("--nw-accent", accent);
    document.documentElement.style.setProperty("--nw-button", buttonColor);
  }, [accent, buttonColor]);

  useEffect(() => {
    if (tab !== "chat") return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showAiTyping, tab]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" || last?.role === "human") {
        playWidgetMessageSound();
      }
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    setHandoffMode("ai");
  }, [serverConversationId]);

  useEffect(() => {
    if (!serverConversationId) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const pollUrl = new URL(config.chatEndpoint, window.location.origin);
        pollUrl.searchParams.set("conversation_id", serverConversationId);
        pollUrl.searchParams.set("since_index", "0");
        pollUrl.searchParams.set("channel", WEB_EMBED_CHANNEL);
        if (previewMode) pollUrl.searchParams.set("preview", "1");
        const res = await fetch(pollUrl.toString());
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.messages)) return;

        if (data.handoff_mode === "human") setHandoffMode("human");
        else if (data.handoff_mode === "ai") setHandoffMode("ai");

        setMessages(prev => {
          const next = [...prev];
          let changed = false;
          for (const raw of data.messages as { role: string; content: string }[]) {
            const role: WidgetMessage["role"] =
              raw.role === "human" ? "human" : raw.role === "user" ? "user" : "assistant";
            const content = String(raw.content ?? "").trim();
            if (!content) continue;
            if (next.some(m => m.role === role && m.content === content)) continue;
            next.push({ id: crypto.randomUUID(), role, content });
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch {
        /* polling silencioso */
      }
    };

    const timer = window.setInterval(poll, 4000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serverConversationId, config.chatEndpoint, previewMode]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: WidgetMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setTab("chat");
      setLoading(true);
      setError("");

      try {
        const res = await fetch(config.chatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
            conversation_id: serverConversationId ?? undefined,
            channel: WEB_EMBED_CHANNEL,
            preview: previewMode ? "1" : undefined
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo enviar el mensaje");

        if (data.conversation_id) {
          setServerConversationId(String(data.conversation_id));
        }
        if (data.handoff || data.handoff_mode === "human") {
          setHandoffMode("human");
        }
        if (data.reply) {
          setMessages(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: String(data.reply) }
          ]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al enviar");
        setMessages(messages);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, handoffMode, serverConversationId, config.chatEndpoint, previewMode]
  );

  const startChat = () => {
    setTab("chat");
  };

  return (
    <div className="nw-root">
      <div className={`nw-panel ${tab === "chat" ? "nw-panel--chat" : ""}`}>
        {tab === "home" ? (
          <div className="nw-home">
            <div
              className="nw-home-header"
              style={{ background: `linear-gradient(135deg, ${accent} 0%, ${buttonColor} 100%)` }}
            >
              <div className="nw-home-header-top">
                <div
                  className="nw-brand-mark nw-brand-mark-bubble"
                  style={{ background: buttonColor, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={2} />
                </div>
                <button type="button" className="nw-icon-btn nw-icon-btn-light" onClick={closeParentWidget} aria-label="Cerrar">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <h1 className="nw-home-title">Hola, ¿qué tal? 👋</h1>
              <p className="nw-home-sub">
                Bienvenido a {config.name}. Pídanos cualquier cosa 🎉
              </p>
            </div>

            <div className="nw-home-scroll">
              <button type="button" className="nw-chat-card" onClick={startChat}>
                <div>
                  <p className="nw-chat-card-title">Chatea con nosotros</p>
                  <p className="nw-chat-card-sub">Normalmente, contestamos en pocos minutos.</p>
                </div>
                <span className="nw-chat-card-icon" style={{ color: accent }}>
                  <Send className="w-5 h-5" />
                </span>
              </button>

              {quickActions.length > 0 && (
                <div className="nw-quick-actions">
                  {quickActions.map(action => {
                    const Icon = resolveMicrositeIcon(action.icon);
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className="nw-quick-action"
                        onClick={() => void sendMessage(action.prompt || action.label)}
                      >
                        <Icon className="w-4 h-4" style={{ color: accent }} />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="nw-chat">
            <div className="nw-chat-header">
              <button type="button" className="nw-icon-btn" onClick={() => setTab("home")} aria-label="Inicio">
                <Home className="w-4 h-4" />
              </button>
              <div className="nw-chat-header-center">
                <p className="nw-chat-header-title">{config.agentName}</p>
                <p className="nw-chat-header-sub">Asistente virtual · en línea</p>
              </div>
              <button type="button" className="nw-icon-btn" onClick={closeParentWidget} aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="nw-messages" ref={scrollRef}>
              {messages.length === 0 && !loading && (
                <p className="nw-empty">Escribe un mensaje para comenzar.</p>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`nw-msg-row nw-msg-appear ${
                    msg.role === "user" ? "nw-msg-row-user" : "nw-msg-row-inbound"
                  }`}
                >
                  {msg.role !== "user" && (
                    <WidgetMessageAvatar
                      role={msg.role}
                      accent={accent}
                      agentName={config.agentName}
                    />
                  )}
                  <div className="nw-msg-content">
                    {msg.role !== "user" && (
                      <span className="nw-msg-sender">
                        {msg.role === "human" ? "Asesor" : config.agentName}
                      </span>
                    )}
                    <div
                      className={`nw-bubble ${msg.role === "user" ? "nw-bubble-user" : "nw-bubble-bot"}`}
                      style={msg.role === "user" ? { backgroundColor: buttonColor } : undefined}
                    >
                      {msg.content}
                    </div>
                  </div>
                  {msg.role === "user" && (
                    <WidgetMessageAvatar
                      role="user"
                      accent={accent}
                      agentName={config.agentName}
                    />
                  )}
                </div>
              ))}
              {showAiTyping && (
                <div className="nw-msg-row nw-msg-row-inbound nw-msg-appear">
                  <WidgetMessageAvatar
                    role="typing"
                    accent={accent}
                    agentName={config.agentName}
                  />
                  <div className="nw-msg-content">
                    <span className="nw-msg-sender">{config.agentName} está escribiendo…</span>
                    <div className="nw-bubble nw-bubble-bot nw-typing-bubble">
                      <div className="nw-typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {error && <p className="nw-error">{error}</p>}
            </div>

            <form
              className="nw-composer"
              onSubmit={e => {
                e.preventDefault();
                void sendMessage(input);
              }}
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Escribe un mensaje…"
                className="nw-input"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="nw-send"
                style={{ backgroundColor: buttonColor }}
                aria-label="Enviar"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        )}

        {tab === "home" && (
          <>
            <nav className="nw-nav">
              <button
                type="button"
                className="nw-nav-item nw-nav-item-active"
                onClick={() => setTab("home")}
                style={{ color: accent }}
              >
                <Home className="w-5 h-5" />
                <span>Inicio</span>
              </button>
              <button
                type="button"
                className="nw-nav-item"
                onClick={() => setTab("chat")}
              >
                <MessageCircle className="w-5 h-5" />
                <span>Chat</span>
              </button>
            </nav>

            <footer className="nw-footer">
              Powered by <strong>Noova 360</strong>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
