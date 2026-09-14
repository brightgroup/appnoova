"use client";

import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";
import { CrmOriQuotePanel } from "@/components/crm/CrmOriQuotePanel";
import { SeguroQuotePanel } from "@/components/crm/SeguroQuotePanel";
import { btnGhost } from "@/lib/brand-ui";

interface LeadCotizacionCardProps {
  /** Organización con el módulo seguros activo — cambia la plantilla de adentro, no el título de la ficha. */
  isSeguros: boolean;
  leadId?: string;
  contactId?: string;
  quoteEndpoint: string | null;
  inboxConversationId?: string | null;
  syncing: boolean;
  syncMsg: string;
  onSync: () => void;
}

/**
 * Una sola ficha "Cotización", relacionada al lead pero con entidad propia
 * (no son campos sueltos del lead) — la plantilla de adentro se acomoda según
 * el tipo de organización: el wizard real de seguros (insurance_quote_requests)
 * o el generador de propuestas genérico de ORI (crm_leads.metadata.crm_quotes).
 */
export function LeadCotizacionCard({
  isSeguros,
  leadId,
  contactId,
  quoteEndpoint,
  inboxConversationId,
  syncing,
  syncMsg,
  onSync
}: LeadCotizacionCardProps) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
        <p className="text-sm font-semibold text-white">Cotizaciones</p>
      </div>

      {isSeguros && leadId ? (
        <SeguroQuotePanel leadId={leadId} />
      ) : quoteEndpoint ? (
        <div className="space-y-3">
          <CrmOriQuotePanel
            quoteEndpoint={quoteEndpoint}
            inboxConversationId={inboxConversationId}
            description="ORI redacta la cotización con el contexto del contacto y esta oportunidad."
          />
          <div className="flex flex-wrap items-center gap-2">
            {inboxConversationId && (
              <>
                <button type="button" onClick={onSync} disabled={syncing} className={`${btnGhost} !text-xs`}>
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sincronizar pipeline con IA"}
                </button>
                <Link
                  href={`/dashboard/inbox?id=${inboxConversationId}`}
                  className="rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-[#99c9ff] hover:bg-white/[.08]"
                >
                  Abrir inbox →
                </Link>
              </>
            )}
          </div>
          {syncMsg && <p className="text-xs text-gray-400">{syncMsg}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Asocia un contacto para poder generar una cotización.</p>
      )}
    </div>
  );
}
