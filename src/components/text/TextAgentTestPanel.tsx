"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { TEXT_LLM_MODELS } from "@/lib/text-agent-options";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface TextAgentTestPanelProps {
  agentId: string | null;
  agentName: string;
  llmModel: string;
  ready: boolean;
  onConversationSaved?: () => void;
}

const STARTER_PROMPTS = [
  "Hola, quiero información sobre sus productos",
  "¿Cuáles son sus horarios de atención?",
  "Me gustaría agendar una reunión"
];

export function TextAgentTestPanel({
  agentId,
  agentName,
  llmModel,
  ready,
  onConversationSaved
}: TextAgentTestPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChat = messages.length > 0;

  const modelLabel =
    TEXT_LLM_MODELS.find(m => m.id === llmModel)?.label ?? llmModel;

  useEffect(() => {
    if (!hasChat) return;
    const el = chatAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, hasChat]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !agentId) return;

    setError("");
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/text/agents/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          agent_id: agentId,
          conversation_id: conversationId ?? undefined,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content }))
        })
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
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        onConversationSaved?.();
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, agentId, conversationId, onConversationSaved]);

  const finalizeConversation = async () => {
    if (!conversationId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/text/agents/conversations", {
        method: "POST",
        headers,
        body: JSON.stringify({ conversation_id: conversationId })
      });
      onConversationSaved?.();
    } catch { /* optional */ }
  };

  const resetChat = async () => {
    await finalizeConversation();
    setConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!ready || !agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Guarda el agente para poder probarlo en chat.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-noova-main relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[500px] h-[320px] bg-[#5b5bf6]/[.05] rounded-full blur-[90px]" />
      </div>

      <div className="relative z-10 shrink-0 flex items-center justify-between px-8 py-4 border-b border-white/[.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5b5bf6] to-[#7070f8] flex items-center justify-center shadow-lg shadow-[#5b5bf6]/25">
            <MessageSquare className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{agentName || "Agente de texto"}</p>
            <p className="text-[11px] text-gray-500">Prueba en vivo · {modelLabel}</p>
          </div>
        </div>
        {hasChat && (
          <button
            onClick={resetChat}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#a5a5ff] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Nueva conversación
          </button>
        )}
      </div>

      <div className={`relative z-10 flex-1 flex flex-col items-center min-h-0 ${hasChat ? "overflow-hidden" : "overflow-y-auto px-8"}`}>
        <div className={`w-full max-w-[780px] flex flex-col flex-1 min-h-0 ${hasChat ? "h-full" : ""}`}>
          {hasChat && (
            <div
              ref={chatAreaRef}
              className="flex-1 overflow-y-auto px-8 py-8 space-y-7 min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[78%] text-[15px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "text-right text-gray-100 font-medium"
                        : "text-left text-gray-400"
                    }`}
                  >
                    {msg.content}
                  </p>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start gap-1.5 items-center py-1">
                  {[0, 100, 200].map(d => (
                    <div
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-[#5b5bf6]/50 animate-pulse"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={`w-full shrink-0 ${hasChat ? "px-8 pb-6 pt-2" : "my-auto px-8 pb-10"}`}>
            {!hasChat && (
              <div className="text-center mb-10">
                <h2 className="text-xl font-semibold text-gray-200 mb-2">
                  Prueba tu agente de texto
                </h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Escribe como lo haría un cliente. Usa la clave de Ori (Gemini) para generar respuestas con el prompt configurado.
                </p>
              </div>
            )}

            {error && (
              <p className="mb-4 text-center text-xs font-medium text-red-400">{error}</p>
            )}

            <div className="rounded-[1.25rem] border border-white/[.09] bg-[#14151c] focus-within:border-[#5b5bf6]/30 focus-within:shadow-[0_0_0_1px_rgba(91,91,246,0.15)] transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje de prueba..."
                disabled={loading}
                rows={hasChat ? 1 : 2}
                className="w-full bg-transparent px-5 pt-4 pb-2 text-base text-gray-100 placeholder-gray-500 resize-none focus:outline-none disabled:opacity-50 min-h-[52px] leading-relaxed"
              />
              <div className="flex items-center justify-end px-4 pb-4 pt-1 gap-2">
                <span className="text-[11px] text-gray-600 mr-auto">{modelLabel}</span>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="p-2.5 rounded-xl bg-[#5b5bf6] hover:bg-[#7070f8] text-white shadow-lg shadow-[#5b5bf6]/25 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                  ) : (
                    <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.25} />
                  )}
                </button>
              </div>
            </div>

            {!hasChat && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 mt-4">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-[#14151c] border border-white/[.07] hover:border-[#5b5bf6]/25 hover:bg-[#5b5bf6]/[.06] text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-all disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
