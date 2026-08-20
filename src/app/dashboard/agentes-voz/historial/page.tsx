"use client";

import { History } from "lucide-react";
import { CallRegistryPanel } from "@/components/voice/CallRegistryPanel";

export default function HistorialLlamadasPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 pt-6 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <History className="w-5 h-5 text-[#0f7eff]" />
          <h1 className="text-xl font-bold tracking-tight text-white">Historial de llamadas</h1>
        </div>
        <p className="text-xs text-gray-500">
          Todas las llamadas de todos tus agentes y campañas.
        </p>
      </div>
      <CallRegistryPanel />
    </div>
  );
}
