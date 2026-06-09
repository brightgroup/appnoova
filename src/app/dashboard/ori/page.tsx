"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, History, FileText, Users, RefreshCw,
  Mail, Phone, Loader2, Plus, Mic, ChevronDown, ArrowUp
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import type { CompanyContext } from "@/types/company-context";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  {
    icon: RefreshCw,
    label: "Renovación",
    prompt: "Ayúdame a redactar un guion breve para recordar la renovación de una póliza de auto que vence en 15 días."
  },
  {
    icon: Users,
    label: "Calificar lead",
    prompt: "¿Qué preguntas clave debo hacer para calificar un prospecto de seguro de vida?"
  },
  {
    icon: FileText,
    label: "Coberturas",
    prompt: "Explícame en términos simples la diferencia entre póliza todo riesgo y básica."
  },
  {
    icon: Mail,
    label: "Email",
    prompt: "Redacta un email corto de seguimiento a un lead que pidió cotización y no respondió."
  },
  {
    icon: Phone,
    label: "Guion de llamada",
    prompt: "Crea un guion breve para confirmar datos antes de renovar una póliza de hogar."
  }
];

export default function OriCopilotoPage() {
  const [userName, setUserName] = useState("Corredor");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [contextId, setContextId] = useState<string>("");
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChat = messages.length > 0;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name =
        user?.user_metadata?.nombre ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Corredor";
      setUserName(name.split(" ")[0]);
    });
  }, []);

  useEffect(() => {
    getAuthHeaders().then(headers =>
      fetch("/api/company-contexts", { headers })
        .then(r => r.json())
        .then(data => {
          const list = (data.contexts ?? []) as CompanyContext[];
          setContexts(list);
          const def = list.find(c => c.is_default) ?? list[0];
          if (def) setContextId(def.id);
        })
    );
  }, []);

  useEffect(() => {
    if (!hasChat) return;
    const el = chatAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, hasChat]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/ori/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: nextMessages,
          company_context_id: contextId || undefined
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
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, contextId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setInput("");
    setError("");
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-noova-main text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#5b5bf6]/[.06] rounded-full blur-[100px]" />
      </div>

      {/* Header Ori */}
      <div className="relative z-10 shrink-0 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5b5bf6] to-[#7070f8] flex items-center justify-center shadow-lg shadow-[#5b5bf6]/30">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-white">Ori</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5b5bf6]/15 text-[#a5a5ff] border border-[#5b5bf6]/25">
              Copiloto
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {contexts.length > 0 && (
            <select
              value={contextId}
              onChange={e => setContextId(e.target.value)}
              className="text-xs font-medium bg-[#14151c] border border-white/[.08] rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-[#5b5bf6]/40"
            >
              {contexts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {hasChat && (
            <button
              onClick={startNewChat}
              className="text-xs font-medium text-gray-500 hover:text-[#a5a5ff] transition-colors"
            >
              Nueva conversación
            </button>
          )}
          <button className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-white transition-colors">
            <History className="w-3.5 h-3.5" />
            Historial
          </button>
        </div>
      </div>

      <div className={`relative z-10 flex-1 flex flex-col items-center min-h-0 ${hasChat ? "overflow-hidden" : "overflow-y-auto px-8"}`}>
        <div className={`w-full max-w-[820px] flex flex-col flex-1 min-h-0 ${hasChat ? "h-full" : ""}`}>

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

          <div className={`w-full shrink-0 ${hasChat ? "px-8 pb-4 pt-2" : "my-auto px-8 pb-12"}`}>

            {!hasChat && (
              <div className="flex items-center justify-center gap-3 mb-12">
                <Sparkles className="w-5 h-5 text-[#5b5bf6]" strokeWidth={1.75} />
                <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold text-gray-200 tracking-tight">
                  ¿Cómo puedo ayudarte hoy,{" "}
                  <span className="text-white">{userName}</span>?
                </h1>
              </div>
            )}

            {error && (
              <p className="mb-4 text-center text-xs font-medium text-red-400">{error}</p>
            )}

            {/* Input amplio */}
            <div className="rounded-[1.35rem] border border-white/[.09] bg-[#14151c] focus-within:border-[#5b5bf6]/30 focus-within:shadow-[0_0_0_1px_rgba(91,91,246,0.15)] transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="¿En qué puedo ayudarte?"
                disabled={loading}
                rows={hasChat ? 1 : 2}
                className="w-full bg-transparent px-6 pt-4 pb-2 text-base text-gray-100 placeholder-gray-500 resize-none focus:outline-none disabled:opacity-50 min-h-[56px] leading-relaxed"
              />
              <div className="flex items-center justify-between px-4 pb-4 pt-1">
                <button
                  type="button"
                  title="Adjuntar (próximamente)"
                  disabled
                  className="p-2.5 rounded-xl text-gray-600 cursor-not-allowed opacity-40"
                >
                  <Plus className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#a5a5ff]/80 hover:text-[#c4c4ff] hover:bg-[#5b5bf6]/[.08] transition-colors"
                  >
                    Gemini 2.5 Flash
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Voz (próximamente)"
                    className="p-2.5 rounded-xl text-gray-600 opacity-40 cursor-not-allowed"
                  >
                    <Mic className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  </button>
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
            </div>

            {!hasChat && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2.5 mt-5">
                {QUICK_ACTIONS.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => sendMessage(action.prompt)}
                      disabled={loading}
                      className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#14151c] border border-white/[.07] hover:border-[#5b5bf6]/25 hover:bg-[#5b5bf6]/[.06] text-[13px] font-medium text-gray-400 hover:text-gray-200 transition-all disabled:opacity-40 sm:w-auto w-full justify-center sm:justify-start"
                    >
                      <Icon className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#5b5bf6] transition-colors" strokeWidth={1.75} />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
