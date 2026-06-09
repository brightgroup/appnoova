"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  Calculator,
  FileCheck,
  HelpCircle,
  Loader2,
  MessageCircle,
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
      <div className={`ac-input-box${variant === "hero" ? " ac-input-box--hero" : ""}`}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="¿En qué puedo ayudarte hoy?"
          disabled={loading}
          rows={variant === "hero" ? 2 : 2}
          className="ac-textarea"
        />
        <div className="ac-input-toolbar">
          <button
            onClick={onSend}
            disabled={!input.trim() || loading}
            className="ac-send"
            aria-label="Enviar mensaje"
          >
            {loading ? (
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <ArrowUp size={20} strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>
    </>
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

export default function AgenteClientesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChat = messages.length > 0;

  useEffect(() => {
    if (hasChat) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, hasChat]);

  useEffect(() => {
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

  return (
    <div
      className="agente-clientes-root"
      style={{ "--ac-accent": BROKER.accent } as React.CSSProperties}
    >
      <div className="ac-bg" aria-hidden="true">
        <div className="ac-bg-orb-1" />
        <div className="ac-bg-orb-2" />
        <div className="ac-bg-grid" />
      </div>

      <header className="ac-header">
        <div className="ac-header-inner">
          <div className="ac-brand">
            <div className="ac-logo">{BROKER.initials}</div>
            <div>
              <p className="ac-brand-name">{BROKER.name}</p>
              <p className="ac-brand-sub">Asistente virtual · {BROKER.agentName}</p>
            </div>
          </div>
          <div className="ac-status">
            <span className="ac-status-dot">
              <span className="ac-status-ping" />
              <span className="ac-status-core" />
            </span>
            <span className="ac-status-label">En línea</span>
          </div>
        </div>
      </header>

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

            <p className="ac-powered">
              Powered by <strong>Noova 360</strong>
              {" · "}
              Respuestas con IA · No sustituye asesoría profesional
            </p>
          </div>
        ) : (
          <>
            <div className="ac-chat-area">
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
                <div ref={bottomRef} />
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
              <QuickActions loading={loading} onAction={sendMessage} />
              <p className="ac-powered">
                Powered by <strong>Noova 360</strong>
                {" · "}
                Respuestas con IA · No sustituye asesoría profesional
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
