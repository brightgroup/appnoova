"use client";

import { Check, ShieldCheck } from "lucide-react";
import type { QuoteResultPreview } from "@/types/ori";

const PERIODICIDAD_LABEL: Record<QuoteResultPreview["periodicidad"], string> = {
  mensual: "Mensual",
  anual: "Anual",
  mensual_y_anual: "Mensual y anual",
  pago_unico: "Pago único"
};

function formatCop(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

/**
 * Previsualización de lo que ORI estructuró a partir de lo que el asesor le
 * dictó (ver estructurar_resultado_cotizacion) — a propósito no tiene botón
 * de "guardar" propio, solo "Usar estos datos" que rellena el formulario real
 * de la ficha para que el asesor revise/ajuste antes de confirmar.
 */
export function QuoteResultPreviewCard({
  preview,
  onUse
}: {
  preview: QuoteResultPreview;
  onUse: (preview: QuoteResultPreview) => void;
}) {
  const mensual = formatCop(preview.precio_mensual);
  const anual = formatCop(preview.precio_anual);

  return (
    <div className="mt-2 rounded-2xl border border-[#0f7eff]/20 bg-[#0f7eff]/[.06] overflow-hidden max-w-sm">
      <div className="px-4 py-3 border-b border-white/[.08] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#2463eb]/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-[#6f95f2]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">{preview.aseguradora}</p>
          {preview.nombre_plan && <p className="text-[10px] text-gray-500">{preview.nombre_plan}</p>}
        </div>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs text-gray-400">{PERIODICIDAD_LABEL[preview.periodicidad]}</p>
        <div className="flex items-baseline gap-3">
          {mensual && <span className="text-lg font-bold text-white">{mensual}<span className="text-[10px] text-gray-500 font-normal">/mes</span></span>}
          {anual && <span className="text-sm text-gray-300">{anual}<span className="text-[10px] text-gray-500 font-normal">/año</span></span>}
        </div>
        {preview.incluye && preview.incluye.length > 0 && (
          <ul className="space-y-1 pt-1">
            {preview.incluye.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" /> {item}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => onUse(preview)}
          className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#0f7eff] hover:bg-[#3392ff] text-white transition-colors"
        >
          Usar estos datos
        </button>
      </div>
    </div>
  );
}
