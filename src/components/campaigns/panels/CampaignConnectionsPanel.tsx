"use client";

import { Database, Sheet } from "lucide-react";

export function CampaignConnectionsPanel() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-gray-400">
          Define dónde enviar los resultados de las llamadas (estado, notas, datos extraídos).
        </p>

        <div className="grid gap-3">
          <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 flex items-start gap-4 opacity-60">
            <div className="w-10 h-10 rounded-lg bg-[#5b5bf6]/15 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#a5a5ff]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">CRM Noova</p>
              <p className="text-xs text-gray-500 mt-1">
                Sincroniza contactos y resultados de llamada con tu CRM.
              </p>
              <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full border border-white/[.10] text-gray-500">
                Próximamente
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 flex items-start gap-4 opacity-60">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Sheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Google Sheets</p>
              <p className="text-xs text-gray-500 mt-1">
                Exporta automáticamente cada fila actualizada a una hoja de cálculo.
              </p>
              <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full border border-white/[.10] text-gray-500">
                Próximamente
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
