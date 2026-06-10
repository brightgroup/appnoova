"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  formatConversationDate,
  getConversationPreview,
  getChatScopeFromPath,
  loadConversationState,
  saveActiveConversation,
  startNewConversation,
  switchConversation,
  type StoredConversation
} from "@/lib/agente-clientes-chat-storage";
import { resolveMicrositeIcon } from "@/lib/microsite-icons";
import { useMicrosite } from "./microsite-context";
import { BrokerLogo } from "./BrokerLogo";
import {
  ArrowUp,
  Loader2,
  MessageCircle,
  Plus,
  X,
  History
} from "lucide-react";

import type { MicrositeQuickAction } from "@/types/microsite";

interface Message {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
}

type ScrollIntent = "assistant-start" | "user-sent" | "conversation-load";

function lightenHex(hex: string, amount = 0.12): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const r = Math.min(255, Math.round(parseInt(n.slice(0, 2), 16) * (1 + amount)));
  const g = Math.min(255, Math.round(parseInt(n.slice(2, 4), 16) * (1 + amount)));
  const b = Math.min(255, Math.round(parseInt(n.slice(4, 6), 16) * (1 + amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function TypingIndicator() {
  return (
    <div className="ac-typing">
      <div className="ac-typing-dots">
        <span className="ac-typing-dot" />
        <span className="ac-typing-dot" />
        <span className="ac-typing-dot" />
      </div>
    </div>
  );
}

function InputComposer({
  input,
  loading,
  error,
  textareaRef,
  onInput,
  onKeyDown,
  onSend,
  variant
}: {
  input: string;
  loading: boolean;
  error: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  variant: "hero" | "footer";
}) {
  return (
    <>
      {error && <p className="ac-error">{error}</p>}
      <div className={`ac-input-box${variant === "hero" ? " ac-input-box--hero" : " ac-input-box--footer"}`}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={variant === "footer" ? "Escribe un mensaje..." : "¿En qué puedo ayudarte hoy?"}
          disabled={loading}
          rows={2}
          className="ac-textarea"
        />
        <div className="ac-input-toolbar">
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || loading}
            className="ac-send"
            aria-label="Enviar mensaje"
          >
            {loading ? (
              <Loader2 size={20} className="ac-spin" />
            ) : (
              <ArrowUp size={20} strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function ConversationHistory({
  open,
  conversations,
  activeId,
  onSelect,
  onClose
}: {
  open: boolean;
  conversations: StoredConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const visibleConversations = conversations.filter(
    c => c.messages.length > 0 || c.id === activeId
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="ac-history-root">
      <button
        type="button"
        className="ac-history-backdrop"
        onClick={onClose}
        aria-label="Cerrar historial"
      />
      <div className="ac-history-panel" role="dialog" aria-label="Conversaciones">
        <div className="ac-history-handle" aria-hidden="true" />
        <div className="ac-history-header">
          <div>
            <p className="ac-history-eyebrow">Historial</p>
            <h2 className="ac-history-heading">Conversaciones</h2>
          </div>
          <button
            type="button"
            className="ac-history-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="ac-history-body">
          {visibleConversations.length === 0 ? (
            <div className="ac-history-empty">
              <MessageCircle size={28} strokeWidth={1.5} />
              <p>Todavía no tienes conversaciones guardadas.</p>
            </div>
          ) : (
            <ul className="ac-history-list">
              {visibleConversations.map(conv => {
                const isActive = conv.id === activeId;
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      className={`ac-history-card${isActive ? " ac-history-card--active" : ""}`}
                      onClick={() => onSelect(conv.id)}
                    >
                      <span className="ac-history-card-icon" aria-hidden="true">
                        <MessageCircle size={15} strokeWidth={1.75} />
                      </span>
                      <span className="ac-history-card-content">
                        <span className="ac-history-card-top">
                          <span className="ac-history-card-title">{conv.title}</span>
                          <span className="ac-history-card-time">
                            {formatConversationDate(conv.updatedAt)}
                          </span>
                        </span>
                        <span className="ac-history-card-preview">
                          {getConversationPreview(conv.messages)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function QuickActions({
  actions,
  loading,
  onAction
}: {
  actions: MicrositeQuickAction[];
  loading: boolean;
  onAction: (prompt: string) => void;
}) {
  return (
    <div className="ac-actions">
      {actions.map(action => {
        const Icon = resolveMicrositeIcon(action.icon);
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.prompt)}
            disabled={loading}
            className="ac-action-btn"
          >
            <span className="ac-action-icon">
              <Icon size={15} strokeWidth={1.75} />
            </span>
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AgenteClientesClient() {
  const config = useMicrosite();
  const pathname = usePathname();
  const chatScope = useMemo(() => getChatScopeFromPath(pathname), [pathname]);
  const initialState = useMemo(() => loadConversationState(chatScope), [chatScope]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialState.activeId);
  const [conversations, setConversations] = useState<StoredConversation[]>(initialState.conversations);
  const [messages, setMessages] = useState<Message[]>(initialState.messages);
  const [serverConversationId, setServerConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatScopeRef = useRef(chatScope);
  const skipPersistRef = useRef(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollIntentRef = useRef<ScrollIntent | null>(null);
  const hasChat = messages.length > 0;

  const applyConversationState = useCallback(
    (state: ReturnType<typeof loadConversationState>) => {
      setActiveConversationId(state.activeId);
      setConversations(state.conversations);
      setMessages(state.messages);
    },
    []
  );

  useEffect(() => {
    if (chatScopeRef.current === chatScope) return;
    chatScopeRef.current = chatScope;
    skipPersistRef.current = true;
    applyConversationState(loadConversationState(chatScope));
    scrollIntentRef.current = "conversation-load";
    setHistoryOpen(false);
  }, [chatScope, applyConversationState]);

  useEffect(() => {
    if (initialState.messages.length > 0) {
      scrollIntentRef.current = "conversation-load";
    }
  }, [initialState.messages.length]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const state = saveActiveConversation(chatScope, activeConversationId, messages);
    setActiveConversationId(state.activeId);
    setConversations(state.conversations);
  }, [messages, chatScope, activeConversationId]);

  useEffect(() => {
    if (!historyOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [historyOpen]);

  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.style.setProperty("--ac-accent", config.accent);
    rootRef.current.style.setProperty("--ac-accent-light", lightenHex(config.accent));
    rootRef.current.style.setProperty("--ac-button", config.buttonColor);
    rootRef.current.style.setProperty("--ac-button-light", lightenHex(config.buttonColor));
  }, [config.accent, config.buttonColor]);

  useEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    if (!root || !header) return;

    const mobileQuery = window.matchMedia("(max-width: 640px)");

    const syncViewport = () => {
      const headerH = header.offsetHeight;
      root.style.setProperty("--ac-header-h", `${headerH}px`);

      if (!mobileQuery.matches) {
        header.style.top = "";
        root.style.top = "";
        root.style.height = "";
        return;
      }

      const vv = window.visualViewport;
      if (!vv) return;

      header.style.top = `${vv.offsetTop}px`;
      root.style.top = `${vv.offsetTop}px`;
      root.style.height = `${vv.height}px`;
    };

    syncViewport();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    mobileQuery.addEventListener("change", syncViewport);

    const observer = new ResizeObserver(syncViewport);
    observer.observe(header);

    return () => {
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      mobileQuery.removeEventListener("change", syncViewport);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!hasChat) return;
    const el = chatAreaRef.current;
    const intent = scrollIntentRef.current;
    if (!el || !intent) return;

    requestAnimationFrame(() => {
      if (intent === "assistant-start" && lastAssistantRef.current) {
        const top = lastAssistantRef.current.offsetTop - 20;
        el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else if (intent === "user-sent" || intent === "conversation-load") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
      scrollIntentRef.current = null;
    });
  }, [messages, hasChat]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) return;
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!serverConversationId || !config.chatEndpoint.includes("/api/public/microsite/")) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `${config.chatEndpoint}?conversation_id=${encodeURIComponent(serverConversationId)}&since_index=0`
        );
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.messages)) return;

        setMessages(prev => {
          const next = [...prev];
          let changed = false;
          for (const raw of data.messages as { role: string; content: string }[]) {
            const role: Message["role"] =
              raw.role === "human" ? "human" : raw.role === "user" ? "user" : "assistant";
            const content = String(raw.content ?? "").trim();
            if (!content) continue;
            if (next.some(m => m.role === role && m.content === content)) continue;
            next.push({ id: crypto.randomUUID(), role, content });
            changed = true;
          }
          if (changed) scrollIntentRef.current = "assistant-start";
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
  }, [serverConversationId, config.chatEndpoint]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollIntentRef.current = "user-sent";

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch(config.chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          conversation_id: serverConversationId ?? undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo obtener respuesta");
        return;
      }
      if (data.conversation_id) {
        setServerConversationId(data.conversation_id);
      }
      if (data.reply) {
        setMessages(prev => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.reply }
        ]);
      }
      scrollIntentRef.current = "assistant-start";
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, config.chatEndpoint, serverConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const startNewChat = () => {
    skipPersistRef.current = true;
    setServerConversationId(null);
    const state = startNewConversation(chatScope);
    applyConversationState(state);
    setInput("");
    setError("");
    setHistoryOpen(false);
    textareaRef.current?.focus();
  };

  const openConversation = (conversationId: string) => {
    skipPersistRef.current = true;
    const state = switchConversation(chatScope, conversationId);
    applyConversationState(state);
    scrollIntentRef.current = "conversation-load";
    setInput("");
    setError("");
    setHistoryOpen(false);
  };

  const lastAssistantIndex = messages.reduce(
    (idx, msg, i) => (msg.role === "assistant" || msg.role === "human" ? i : idx),
    -1
  );

  return (
    <div ref={rootRef} className="agente-clientes-root">
      <header ref={headerRef} className="ac-header">
        <div className="ac-header-inner">
          <div className="ac-header-start">
            <div className="ac-brand">
              <BrokerLogo
                logoUrl={config.faviconUrl ?? config.logoUrl}
                initials={config.initials}
                name={config.name}
                className="ac-logo--favicon"
              />
              <div className="ac-brand-text ac-brand-text--desktop">
                <p className="ac-brand-name">{config.name}</p>
                <p className="ac-brand-sub">Asistente virtual · {config.agentName}</p>
              </div>
            </div>
          </div>

          <div className="ac-header-end">
            <div className="ac-header-actions">
              <button
                type="button"
                onClick={() => setHistoryOpen(open => !open)}
                className={`ac-icon-btn ac-header-history${historyOpen ? " ac-icon-btn--active" : ""}`}
                aria-label="Ver conversaciones"
                title="Conversaciones"
              >
                <History size={18} strokeWidth={1.75} />
                <span className="ac-btn-label">Historial</span>
              </button>
              <button
                type="button"
                onClick={startNewChat}
                className="ac-icon-btn ac-header-new"
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <Plus size={18} strokeWidth={1.75} />
                <span className="ac-btn-label">Nueva conversación</span>
              </button>
            </div>
            <div className="ac-status" title="En línea">
              <span className="ac-status-dot">
                <span className="ac-status-ping" />
                <span className="ac-status-core" />
              </span>
              <span className="ac-status-label">En línea</span>
            </div>
          </div>
        </div>
      </header>

      <ConversationHistory
        open={historyOpen}
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={openConversation}
        onClose={() => setHistoryOpen(false)}
      />

      <main className={`ac-main${hasChat ? " ac-main--chat" : " ac-main--idle"}`}>
        {!hasChat ? (
          <div className="ac-center-hub">
            <div className="ac-welcome-head">
              <div className="ac-welcome-logo">
                <BrokerLogo
                  logoUrl={config.logoUrl}
                  initials={config.initials}
                  name={config.name}
                />
              </div>

              <h1 className="ac-greeting-text">Hola, soy {config.agentName}</h1>
              <p className="ac-greeting-sub">
                Tu asistente de {config.name}. Puedo ayudarte a cotizar, consultar pólizas,
                reportar siniestros y más.
              </p>
            </div>

            <div className="ac-composer-block">
              <InputComposer
                input={input}
                loading={loading}
                error={error}
                textareaRef={textareaRef}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onSend={() => sendMessage(input)}
                variant="hero"
              />
              <QuickActions actions={config.quickActions} loading={loading} onAction={sendMessage} />
            </div>

            <p className="ac-powered ac-powered--idle">
              {config.agentName} es IA y puede cometer errores. Por favor, verifica las respuestas.
              {" "}
              <span className="ac-powered-credit">Powered by Noova 360</span>
            </p>
          </div>
        ) : (
          <>
            <div ref={chatAreaRef} className="ac-chat-area">
              <div className="ac-messages">
                {messages.map((msg, i) => (
                  <div
                    key={msg.id}
                    ref={i === lastAssistantIndex ? lastAssistantRef : undefined}
                    className={`ac-msg-row ac-msg-row--${msg.role}`}
                    style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                  >
                    <div className={`ac-bubble ac-bubble--${msg.role}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && <TypingIndicator />}
              </div>
            </div>

            <div className="ac-footer">
              <InputComposer
                input={input}
                loading={loading}
                error={error}
                textareaRef={textareaRef}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onSend={() => sendMessage(input)}
                variant="footer"
              />
              <p className="ac-powered ac-powered--chat">
                {config.agentName} es IA y puede cometer errores. Por favor, verifica las respuestas.
                {" "}
                <span className="ac-powered-credit">Powered by Noova 360</span>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
