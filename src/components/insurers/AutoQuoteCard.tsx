"use client";

import { useState } from "react";
import { Car, AlertTriangle, ShieldCheck, User, IdCard, Cake, Send, Clock } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  nombre_tomador: "Nombre completo",
  documento_tomador: "Número de documento",
  fecha_nacimiento_tomador: "Fecha de nacimiento"
};

const FIELD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  nombre_tomador: User,
  documento_tomador: IdCard,
  fecha_nacimiento_tomador: Cake
};

interface AutoQuoteVehicle {
  marca?: string;
  linea?: string;
  codigo_fasecolda?: string;
}

interface AutoQuoteResultLike {
  ok?: boolean;
  reason?: string;
  vehiculo?: AutoQuoteVehicle;
  faltan_datos?: string[];
  pendiente?: boolean;
  aseguradora?: string;
  prima?: number | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
}

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    value
  );
}

/**
 * Tarjeta compartida del resultado de cotizar_seguro_auto — misma pieza en
 * ORI, Mi Link y el widget web (ver plan Fase 2.4). En vez de dejar que el
 * modelo "pregunte bonito" en prosa cuando faltan datos, se renderiza un
 * mini-formulario real; el envío compone un mensaje de usuario claro que
 * alimenta el siguiente turno de la conversación — la IA sigue llevando la
 * conversación, esto solo le da al humano una forma más cómoda de responder.
 */
export function AutoQuoteCard({
  result,
  onSendMessage
}: {
  result: AutoQuoteResultLike;
  onSendMessage: (text: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const vehiculoLine = result.vehiculo
    ? [result.vehiculo.marca, result.vehiculo.linea].filter(Boolean).join(" ")
    : null;

  if (result.faltan_datos && result.faltan_datos.length > 0) {
    const faltantes = result.faltan_datos;
    const complete = faltantes.every(f => values[f]?.trim());

    return (
      <div className="mt-2 rounded-2xl border border-white/[.08] bg-black/20 overflow-hidden max-w-sm">
        <div className="px-4 py-3 border-b border-white/[.08] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2463eb]/15 flex items-center justify-center shrink-0">
            <Car className="w-4 h-4 text-[#6f95f2]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">
              {vehiculoLine || "Vehículo encontrado"}
            </p>
            {result.vehiculo?.codigo_fasecolda && (
              <p className="text-[10px] text-gray-500">Fasecolda {result.vehiculo.codigo_fasecolda}</p>
            )}
          </div>
        </div>
        <div className="p-4 space-y-2.5">
          <p className="text-[11px] text-gray-400">Faltan estos datos para darte un precio real:</p>
          {faltantes.map(field => {
            const Icon = FIELD_ICONS[field] ?? User;
            return (
              <div key={field} className="relative">
                <Icon className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={field === "fecha_nacimiento_tomador" ? "date" : "text"}
                  value={values[field] ?? ""}
                  onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                  placeholder={FIELD_LABELS[field] ?? field}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
            );
          })}
          <button
            type="button"
            disabled={!complete}
            onClick={() =>
              onSendMessage(
                faltantes.map(f => `${FIELD_LABELS[f] ?? f}: ${values[f]?.trim()}`).join("\n")
              )
            }
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#0f7eff] hover:bg-[#3392ff] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Continuar cotización
          </button>
        </div>
      </div>
    );
  }

  if (result.pendiente) {
    return (
      <div className="mt-2 max-w-sm rounded-xl border border-[#0f7eff]/20 bg-[#0f7eff]/[.06] px-4 py-3 flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-[#6f95f2] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-white font-medium">{vehiculoLine || "Datos completos"}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Un asesor va a confirmar el precio real en breve — ya quedó en la cola.
          </p>
        </div>
      </div>
    );
  }

  if (result.ok === false) {
    return (
      <div className="mt-2 max-w-sm rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">{result.reason ?? "No se pudo cotizar."}</p>
      </div>
    );
  }

  if (typeof result.prima === "number") {
    return (
      <div className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] overflow-hidden max-w-sm">
        <div className="px-4 py-3 border-b border-emerald-500/20 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">{vehiculoLine || "Cotización de auto"}</p>
            <p className="text-[10px] text-gray-500">{result.aseguradora ?? "Aseguradora conectada"}</p>
          </div>
        </div>
        <div className="p-4">
          <p className="text-2xl font-bold text-white">{formatCop(result.prima)}</p>
          {(result.vigencia_desde || result.vigencia_hasta) && (
            <p className="text-[11px] text-gray-500 mt-1">
              Vigencia {result.vigencia_desde ?? "—"} a {result.vigencia_hasta ?? "—"}
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
