"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";
import type { CrmQuoteRecord } from "@/lib/crm-ai-extract";

interface CrmOriQuotePanelProps {
  quoteEndpoint: string;
  inboxConversationId?: string | null;
  description?: string;
  onQuoteBusyChange?: (busy: boolean) => void;
}

export function CrmOriQuotePanel({
  quoteEndpoint,
  inboxConversationId,
  description = "Genera una cotización con ORI según el contexto del contacto y la oportunidad.",
  onQuoteBusyChange
}: CrmOriQuotePanelProps) {
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<CrmQuoteRecord | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [copied, setCopied] = useState(false);

  const generateQuote = async () => {
    setQuoteLoading(true);
    onQuoteBusyChange?.(true);
    setQuoteError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(quoteEndpoint, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setQuoteError(data.error || "Error al generar cotización");
        return;
      }
      setQuote(data.quote ?? null);
    } catch {
      setQuoteError("Error de red");
    } finally {
      setQuoteLoading(false);
      onQuoteBusyChange?.(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waSendHref =
    inboxConversationId && quote?.whatsapp_message
      ? `/dashboard/inbox?id=${inboxConversationId}`
      : undefined;

  return (
    <div className="rounded-xl border border-[#0f7eff]/20 bg-[#0f7eff]/[.06] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Asistente de cotización ORI</h3>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={generateQuote}
          disabled={quoteLoading}
          className={btnPrimary}
        >
          {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generar cotización"}
        </button>
      </div>
      {quoteError && <p className="text-xs text-red-400">{quoteError}</p>}
      {quote ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">{quote.title}</p>
              <p className="text-xs text-gray-500">{new Date(quote.created_at).toLocaleString("es")}</p>
            </div>
            <button type="button" onClick={() => copyText(quote.body)} className={btnGhost} title="Copiar">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
            {quote.body}
          </pre>
          {quote.whatsapp_message && (
            <div className="pt-3 border-t border-white/[.08]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Mensaje WhatsApp</p>
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{quote.whatsapp_message}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => copyText(quote.whatsapp_message)} className={btnGhost}>
                  <Copy className="w-3.5 h-3.5" /> Copiar WA
                </button>
                {waSendHref && (
                  <Link href={waSendHref} className={btnPrimary}>
                    Abrir inbox para enviar
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          ORI usa el conocimiento del tenant y los datos del contacto para redactar la cotización.
        </p>
      )}
    </div>
  );
}
