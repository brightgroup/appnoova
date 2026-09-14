"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { PlateBadge } from "@/components/crm/PlateBadge";

interface QuoteRequestSummary {
  id: string;
  ramo: string;
  placa: string | null;
  estado: string;
  resultado: { aseguradora?: string; prima?: number | null; nombre_plan?: string } | null;
}

interface Guidance {
  step: "sin_cotizacion" | "cotizar_automatico" | "registrar_manual" | "generar_pdf" | "cerrada";
  message: string;
  quote: QuoteRequestSummary | null;
}

const RAMO_LABEL: Record<string, string> = { autos: "Auto", vida: "Vida", hogar: "Hogar", salud: "Salud" };

function formatCop(value: number | null | undefined): string {
  if (value == null) return "";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

/**
 * Cotizaciones YA REALIZADAS de este lead (con resultado real, sea que lo
 * haya cerrado la IA/un conector o un asesor a mano) — las que todavía están
 * reuniendo datos no aparecen acá, viven en LeadRamoDatosCard (decisión
 * explícita: esto es la relación con la entidad Cotización, no un segundo
 * lugar para editar datos en curso). Cada tarjeta lleva a la ficha completa
 * (/dashboard/crm/cotizaciones/[id]).
 */
function QuoteCard({ quote }: { quote: QuoteRequestSummary }) {
  const resumen = [quote.resultado?.nombre_plan ?? quote.resultado?.aseguradora, formatCop(quote.resultado?.prima)]
    .filter(Boolean)
    .join(" · ");

  return (
    <a
      href={`/dashboard/crm/cotizaciones/${quote.id}`}
      className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.02] hover:bg-white/[.04] p-4 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-[#2463eb]/15 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">Seguro de {RAMO_LABEL[quote.ramo] ?? quote.ramo}</p>
          {quote.placa && <PlateBadge plate={quote.placa} />}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{resumen}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-500 shrink-0" />
    </a>
  );
}

export function SeguroQuotePanel({ leadId }: { leadId: string }) {
  const [guidances, setGuidances] = useState<Guidance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${leadId}/seguro-cotizacion`, { headers });
    const data = await res.json().catch(() => null);
    if (res.ok && data) setGuidances(data.guidances ?? []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-4 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando cotización…
      </div>
    );
  }

  const realizadas = guidances
    .map(g => g.quote)
    .filter((q): q is QuoteRequestSummary => Boolean(q) && (q!.estado === "cotizada" || q!.estado === "enviada_externa"));

  if (realizadas.length === 0) {
    return <p className="text-xs text-gray-500">Aún no hay ninguna cotización con resultado registrado.</p>;
  }

  return (
    <div className="space-y-3">
      {realizadas.map(q => (
        <QuoteCard key={q.id} quote={q} />
      ))}
    </div>
  );
}
