"use client";

import { useEffect, useRef } from "react";
import { Plug, Loader2, CheckCircle2 } from "lucide-react";
import { ConnectorIconTile } from "@/components/automations/ConnectorIconTile";
import { useConnectorsSummary } from "@/hooks/useConnectorsSummary";

/** Menú tipo Claude ("+" del composer) — muestra qué conectores están activos y abre el explorador completo para gestionarlos. Los conectores son los mismos que usan ORI y los agentes creados, no un set aparte. */
export function ConnectorsQuickMenu({
  onClose,
  onOpenExplore
}: {
  onClose: () => void;
  onOpenExplore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { items, loading } = useConnectorsSummary();

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl border border-white/[.10] bg-noova-surface shadow-2xl overflow-hidden z-50"
    >
      <div className="px-4 py-3 border-b border-white/[.08]">
        <p className="text-xs font-semibold text-white">Conectores</p>
        <p className="text-[11px] text-gray-500 mt-0.5">Disponibles para ORI y tus agentes</p>
      </div>

      <div className="max-h-64 overflow-y-auto py-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-white/[.04]">
              <ConnectorIconTile id={item.id} size="sm" />
              <span className="text-xs text-gray-200 flex-1 truncate">{item.name}</span>
              {item.connected ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <span className="text-[10px] text-gray-600 shrink-0">Sin conectar</span>
              )}
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenExplore();
        }}
        className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-white/[.08] text-xs font-medium text-[#99c9ff] hover:bg-[#0f7eff]/10 transition-colors"
      >
        <Plug className="w-3.5 h-3.5" /> Explorar / conectar más
      </button>
    </div>
  );
}
