"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import { DEFAULT_TEXT_MODEL } from "@/lib/text-agent-options";
import { SendIcon, SparkleIcon } from "../../../icons";
import { toolProductRows, toolMovementRows, toolTruncationCaption, type OriToolCall } from "@/types/ori";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: OriToolCall[];
}

function OriToolResultCards({ toolCalls }: { toolCalls: OriToolCall[] }) {
  return (
    <>
      {toolCalls.map((call, i) => {
        const productos = toolProductRows(call);
        const movimientos = toolMovementRows(call);
        const caption = toolTruncationCaption(call);

        if (productos.length > 0) {
          return (
            <div key={i} className="ori-result-card">
              {productos.map(p => (
                <div key={p.codigo} className="ori-result-row">
                  <div className="ori-result-main">
                    <span className="ori-result-title">{p.nombre}</span>
                    <span className="ori-result-sub">{p.codigo}</span>
                  </div>
                  <span className={`ori-result-value${p.bajo_minimo ? " warn" : ""}`}>{p.existencia}</span>
                </div>
              ))}
              {caption && <p className="ori-result-caption">{caption}</p>}
            </div>
          );
        }

        if (movimientos.length > 0) {
          return (
            <div key={i} className="ori-result-card">
              {movimientos.map((m, idx) => (
                <div key={idx} className="ori-result-row">
                  <div className="ori-result-main">
                    <span className="ori-result-title">{m.producto}</span>
                    <span className="ori-result-sub">{m.fecha} · {m.tipo}</span>
                  </div>
                  <span className={`ori-result-value${m.cantidad > 0 ? "" : " warn"}`}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </span>
                </div>
              ))}
              {caption && <p className="ori-result-caption">{caption}</p>}
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

const QUICK_ACTIONS = [
  "¿Qué se está por agotar en el inventario?",
  "Ayúdame a redactar un recordatorio de pago",
  "¿Qué preguntas hago para calificar un lead?",
  "Resume cómo responder a un cliente indeciso"
];

export default function MobileOriPage() {
  const [userName, setUserName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChat = messages.length > 0;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name =
        (user?.user_metadata?.nombre as string | undefined) ||
        (user?.user_metadata?.full_name as string | undefined) ||
        user?.email?.split("@")[0] ||
        "";
      setUserName(name.split(" ")[0] ?? "");
    });
  }, []);

  useEffect(() => {
    if (!hasChat || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, loading, hasChat]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError("");
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await authFetch("/api/ori/chat", {
          method: "POST",
          body: JSON.stringify({ messages: nextMessages, model: DEFAULT_TEXT_MODEL })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo obtener respuesta.");
          return;
        }
        setMessages(prev => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.reply, toolCalls: data.tool_calls ?? [] }
        ]);
      } catch {
        setError("Error de red. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function startNewChat() {
    setMessages([]);
    setInput("");
    setError("");
    textareaRef.current?.focus();
  }

  return (
    <div className="nv-m-chat-mode ori-page" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="app-head">
        <div className="head-row">
          <div>
            <p className="kicker">Noova360</p>
            <h1>
              Ori<span className="ori-badge">Copiloto</span>
            </h1>
          </div>
          {hasChat ? (
            <button type="button" className="ori-new-chat" onClick={startNewChat}>
              Nuevo chat
            </button>
          ) : null}
        </div>
      </div>

      {hasChat ? (
        <div className="thread" ref={threadRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`msg ${msg.role === "user" ? "visitor" : "agent"}`}>
              {msg.role === "user" ? (
                <div className="vbubble">{msg.content}</div>
              ) : (
                <>
                  <div className="agent-text">{msg.content}</div>
                  {msg.toolCalls && msg.toolCalls.length > 0 && <OriToolResultCards toolCalls={msg.toolCalls} />}
                </>
              )}
            </div>
          ))}
          {loading ? (
            <div className="msg agent">
              <div className="dots">
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="ori-empty">
          <div className="ori-empty-icon">
            <SparkleIcon />
          </div>
          <p className="ori-empty-title">
            ¿Cómo puedo ayudarte hoy{userName ? `, ${userName}` : ""}?
          </p>
          <div className="ori-chips">
            {QUICK_ACTIONS.map(prompt => (
              <button key={prompt} type="button" className="ori-chip" onClick={() => sendMessage(prompt)} disabled={loading}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ori-footer">
        {error ? <p className="form-error">{error}</p> : null}
        <form className="composer-inner" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Escribe a Ori…"
            aria-label="Mensaje para Ori"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
          />
          <button type="submit" className="send" aria-label="Enviar" disabled={loading || !input.trim()}>
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
