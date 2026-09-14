"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { OriToolResultView } from "@/components/ori/OriToolResultView";
import type { OriToolCall, QuoteResultPreview } from "@/types/ori";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: OriToolCall[];
}

/**
 * Chat de ORI embebido dentro de otra pantalla (hoy: la ficha de cotización,
 * /dashboard/crm/cotizaciones/[id]) — mismo endpoint /api/ori/chat que el
 * copiloto de página completa (dashboard/ori/page.tsx), pero compacto y
 * *scoped* a un registro puntual vía `quoteId` (el backend inyecta el
 * contexto y habilita las tools correspondientes, ver src/app/api/ori/chat/route.ts).
 * No reemplaza el copiloto general — es la primera pantalla que embebe una
 * conversación de ORI en vez de una sola acción de "generar" (ver
 * CrmOriQuotePanel.tsx para ese patrón anterior).
 */
export function OriChatPanel({
  quoteId,
  onUseQuotePreview,
  placeholder = "Cuéntale a ORI cómo quedó la cotización…"
}: {
  quoteId: string;
  onUseQuotePreview?: (preview: QuoteResultPreview) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
        const headers = await getAuthHeaders();
        const res = await fetch("/api/ori/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({ messages: nextMessages, quote_id: quoteId })
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
    },
    [messages, loading, quoteId]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] flex flex-col h-full min-h-[420px]">
      <div className="px-4 py-3 border-b border-white/[.08] flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0f7eff] to-[#3392ff] flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-sm font-semibold text-white flex-1">Estructurar con ORI</p>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/ori?quote_id=${quoteId}`)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors shrink-0"
          title="Abrir en el chat principal de ORI"
        >
          <ExternalLink className="w-3 h-3" /> Chat principal
        </button>
      </div>

      <div ref={chatAreaRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500">
            Cuéntale a ORI con qué aseguradora cotizaste y en qué condiciones — te va a ayudar a estructurar el
            resultado antes de guardarlo.
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={msg.role === "user" ? "text-right" : "text-left"}>
            <p className={`text-xs leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "text-gray-200" : "text-gray-400"}`}>
              {msg.content}
            </p>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="text-left">
                <OriToolResultView toolCalls={msg.toolCalls} onUseQuotePreview={onUseQuotePreview} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 items-center py-1">
            {[0, 100, 200].map(d => (
              <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#0f7eff]/50 animate-pulse" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-1 text-[11px] text-red-400">{error}</p>}

      <div className="p-3 border-t border-white/[.08] flex items-center gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          rows={1}
          className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-500 outline-none resize-none py-2 px-3 rounded-lg border border-white/[.08] focus:border-[#0f7eff]/40"
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="shrink-0 p-2 rounded-lg bg-[#0f7eff] hover:bg-[#3392ff] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
