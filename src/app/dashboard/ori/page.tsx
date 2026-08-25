"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, History, FileText, Users, RefreshCw,
  Mail, Phone, Loader2, Plus, Mic, ArrowUp
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import type { CompanyContext } from "@/types/company-context";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { Badge } from "@/components/ui/Badge";
import { TEXT_LLM_MODELS, DEFAULT_TEXT_MODEL, resolveTextLlm } from "@/lib/text-agent-options";
import { llmModelIcon } from "@/lib/llm/provider-icon";
import { OriToolResultView } from "@/components/ori/OriToolResultView";
import type { OriToolCall } from "@/types/ori";

const ORI_MODEL_STORAGE_KEY = "noova_ori_model";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: OriToolCall[];
}

const QUICK_ACTIONS = [
  {
    icon: RefreshCw,
    label: "Recordatorio",
    prompt: "Ayúdame a redactar un guion breve para recordar a un cliente un pago o vencimiento que ocurre en 15 días."
  },
  {
    icon: Users,
    label: "Calificar lead",
    prompt: "¿Qué preguntas clave debo hacer para calificar un prospecto entrante?"
  },
  {
    icon: FileText,
    label: "Propuesta",
    prompt: "Explícame en términos simples cómo presentar nuestra propuesta de valor a un cliente nuevo."
  },
  {
    icon: Mail,
    label: "Email",
    prompt: "Redacta un email corto de seguimiento a un lead que pidió información y no respondió."
  },
  {
    icon: Phone,
    label: "Guion de llamada",
    prompt: "Crea un guion breve para confirmar datos antes de agendar una reunión comercial."
  }
];

export default function OriCopilotoPage() {
  const [userName, setUserName] = useState("Usuario");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [contextId, setContextId] = useState<string>("");
  const [model, setModel] = useState<string>(DEFAULT_TEXT_MODEL);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasChat = messages.length > 0;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name =
        user?.user_metadata?.nombre ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Usuario";
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
    const saved = localStorage.getItem(ORI_MODEL_STORAGE_KEY);
    if (saved) setModel(resolveTextLlm(saved));
  }, []);

  const handleModelChange = (v: string) => {
    setModel(v);
    localStorage.setItem(ORI_MODEL_STORAGE_KEY, v);
  };

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
          company_context_id: contextId || undefined,
          model
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo obtener respuesta");
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
  }, [messages, loading, contextId, model]);

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
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#0f7eff]/[.06] rounded-full blur-[100px]" />
      </div>

      {/* Header Ori */}
      <div className="relative z-10 shrink-0 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="nv-ori-icon w-9 h-9 rounded-xl bg-gradient-to-br from-[#0f7eff] to-[#3392ff] flex items-center justify-center shadow-lg shadow-[#0f7eff]/30">
            <Sparkles className="w-4 h-4 text-white nv-ori-icon-glyph" strokeWidth={2} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-white nv-ori-title">Ori</span>
            <Badge variant="accent">Copiloto</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {contexts.length > 0 && (
            <NoovaSelect
              value={contextId}
              onChange={setContextId}
              allowEmpty={false}
              className="w-auto min-w-[140px]"
              options={contexts.map(c => ({ value: c.id, label: c.name }))}
            />
          )}
          {hasChat && (
            <button
              onClick={startNewChat}
              className="text-xs font-medium text-gray-500 hover:text-[#99c9ff] transition-colors"
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
                  <div className={msg.role === "user" ? "max-w-[78%]" : "max-w-[92%] w-full"}>
                    <p
                      className={`text-[15px] leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "text-right text-gray-100 font-medium"
                          : "text-left text-gray-400"
                      }`}
                    >
                      {msg.content}
                    </p>
                    {msg.toolCalls && msg.toolCalls.length > 0 && <OriToolResultView toolCalls={msg.toolCalls} />}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start gap-1.5 items-center py-1">
                  {[0, 100, 200].map(d => (
                    <div
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-[#0f7eff]/50 animate-pulse"
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
                <Sparkles className="w-5 h-5 text-[#0f7eff]" strokeWidth={1.75} />
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
            <div className="nv-ori-composer rounded-[1.35rem] border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] focus-within:border-[#0f7eff]/30 focus-within:shadow-[0_0_0_1px_rgba(15,126,255,0.15)] transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="¿En qué puedo ayudarte?"
                disabled={loading}
                rows={hasChat ? 1 : 2}
                className="nv-ori-composer-input w-full bg-transparent px-6 pt-4 pb-2 text-base text-[var(--nv-text)] placeholder-[var(--nv-text-faint)] resize-none focus:outline-none disabled:opacity-50 min-h-[56px] leading-relaxed"
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
                  <NoovaSelect
                    value={model}
                    onChange={handleModelChange}
                    allowEmpty={false}
                    className="w-auto min-w-[130px]"
                    options={TEXT_LLM_MODELS.map(m => ({ value: m.id, label: m.label, icon: llmModelIcon(m.id) }))}
                  />
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
                    className="p-2.5 rounded-xl bg-[#0f7eff] hover:bg-[#3392ff] text-white shadow-lg shadow-[#0f7eff]/25 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed transition-all"
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
                      className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] hover:border-[#0f7eff]/25 hover:bg-[var(--nv-accent-muted)] text-[13px] font-medium text-[var(--nv-text-muted)] hover:text-[var(--nv-text)] transition-all disabled:opacity-40 sm:w-auto w-full justify-center sm:justify-start"
                    >
                      <Icon className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#0f7eff] transition-colors" strokeWidth={1.75} />
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
