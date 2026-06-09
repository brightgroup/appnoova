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
import {
  ArrowUp,
  Calculator,
  FileCheck,
  HelpCircle,
  History,
  Loader2,
  MessageCircle,
  Plus,
  X,
  RefreshCw,
  Shield,
  Sparkles,
  AlertTriangle
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Datos de demo — luego vendrán del link del corredor (/agenteclientes/[slug]) */
const BROKER = {
  name: "Seguros García & Asociados",
  agentName: "Valentina",
  initials: "SG",
  accent: "#5b5bf6"
};

const QUICK_ACTIONS = [
  {
    icon: Calculator,
    label: "Cotizar",
    prompt: "Quiero cotizar un seguro. ¿Qué información necesitas?"
  },
  {
    icon: HelpCircle,
    label: "Consultar",
    prompt: "Tengo una duda sobre mi seguro, ¿me puedes ayudar?"
  },
  {
    icon: FileCheck,
    label: "Mis pólizas",
    prompt: "Quiero consultar el estado de mis pólizas vigentes."
  },
  {
    icon: AlertTriangle,
    label: "Siniestro",
    prompt: "Necesito reportar un siniestro. ¿Cuál es el proceso?"
  },
  {
    icon: RefreshCw,
    label: "Renovar",
    prompt: "Mi póliza está por vencer, quiero saber cómo renovarla."
  }
];

function TypingIndicator() {
  return (
    <div className="ac-typing">
      <div className="ac-msg-avatar">
        <Sparkles size={14} strokeWidth={2} />
      </div>
      <div className="ac-typing-bubble">
        <div className="ac-typing-dots">
          <span className="ac-typing-dot" />
          <span className="ac-typing-dot" />
          <span className="ac-typing-dot" />
        </div>
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
  loading,
  onAction
}: {
  loading: boolean;
  onAction: (prompt: string) => void;
}) {
  return (
    <div className="ac-actions">
      {QUICK_ACTIONS.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
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
  const pathname = usePathname();
  const chatScope = useMemo(() => getChatScopeFromPath(pathname), [pathname]);
  const initialState = useMemo(() => loadConversationState(chatScope), [chatScope]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialState.activeId);
  const [conversations, setConversations] = useState<StoredConversation[]>(initialState.conversations);
  const [messages, setMessages] = useState<Message[]>(initialState.messages);
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
  const hasChat = messages.length > 0;

  const headerTitle = useMemo(() => {
    const active = conversations.find(c => c.id === activeConversationId);
    if (active?.messages.length) return active.title;
    return BROKER.agentName;
  }, [conversations, activeConversationId]);

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
    setHistoryOpen(false);
  }, [chatScope, applyConversationState]);

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
    rootRef.current?.style.setProperty("--ac-accent", BROKER.accent);
  }, []);

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
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, hasChat]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) return;
    textareaRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/agenteclientes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo obtener respuesta");
        return;
      }
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: data.reply }
      ]);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

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
    setInput("");
    setError("");
    setHistoryOpen(false);
  };

  return (
    <div ref={rootRef} className="agente-clientes-root">
      <div className="ac-bg" aria-hidden="true">
        <div className="ac-bg-orb-1" />
        <div className="ac-bg-orb-2" />
        <div className="ac-bg-grid" />
      </div>

      <header ref={headerRef} className="ac-header">
        <div className="ac-header-inner">
          <button
            type="button"
            onClick={() => setHistoryOpen(open => !open)}
            className={`ac-icon-btn ac-header-mobile-only ac-header-slot-left${historyOpen ? " ac-icon-btn--active" : ""}`}
            aria-label="Ver conversaciones"
          >
            <History size={18} strokeWidth={1.75} />
          </button>

          <div className="ac-brand ac-header-desktop-only">
            <div className="ac-logo">{BROKER.initials}</div>
            <div className="ac-brand-text">
              <p className="ac-brand-name">{BROKER.name}</p>
              <p className="ac-brand-sub">Asistente virtual · {BROKER.agentName}</p>
            </div>
          </div>

          <h1 className="ac-header-title ac-header-mobile-only">{headerTitle}</h1>

          <div className="ac-header-slot-right">
            <div className="ac-header-tools ac-header-desktop-only">
              <button
                type="button"
                onClick={() => setHistoryOpen(open => !open)}
                className={`ac-icon-btn${historyOpen ? " ac-icon-btn--active" : ""}`}
                aria-label="Ver conversaciones"
                title="Conversaciones"
              >
                <History size={16} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={startNewChat}
                className="ac-icon-btn"
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              className="ac-icon-btn ac-header-mobile-only"
              aria-label="Nueva conversación"
            >
              <Plus size={18} strokeWidth={1.75} />
            </button>
            <div className="ac-status ac-header-desktop-only" title="En línea">
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
              <div className="ac-avatar-wrap">
                <div className="ac-avatar">
                  <MessageCircle size={36} strokeWidth={1.5} />
                </div>
                <div className="ac-avatar-badge">
                  <Shield size={14} strokeWidth={2} />
                </div>
              </div>

              <h1 className="ac-greeting-text">Hola, soy {BROKER.agentName}</h1>
              <p className="ac-greeting-sub">
                Tu asistente de {BROKER.name}. Puedo ayudarte a cotizar, consultar pólizas,
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
              <QuickActions loading={loading} onAction={sendMessage} />
            </div>

            <p className="ac-powered ac-powered--idle">
              Valentina es IA y puede cometer errores. Por favor, verifica las respuestas.
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
                    className={`ac-msg-row ac-msg-row--${msg.role}`}
                    style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                  >
                    {msg.role === "assistant" && (
                      <div className="ac-msg-avatar">
                        <Sparkles size={14} strokeWidth={2} />
                      </div>
                    )}
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
                Valentina es IA y puede cometer errores. Por favor, verifica las respuestas.
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
