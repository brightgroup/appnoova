"use client";

import { Phone, Trash2, Loader2 } from "lucide-react";
import {
  registryRowIcon, registryTableHead, registryTableHeadRow, registryTableRow, textMuted
} from "@/lib/brand-ui";
import { countryLabel } from "@/lib/telephony/countries";

export interface PhoneLineRow {
  id: string;
  e164: string;
  country_code: string;
  status: string;
  provider: string;
  clientName?: string | null;
  agentName?: string | null;
}

interface PhoneLinesTableProps {
  rows: PhoneLineRow[];
  mode: "admin" | "client";
  loading?: boolean;
  emptyMessage?: string;
  onRelease?: (id: string, e164: string) => void;
  releasingId?: string | null;
}

export function PhoneLinesTable({
  rows,
  mode,
  loading,
  emptyMessage = "No hay líneas todavía.",
  onRelease,
  releasingId
}: PhoneLinesTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando líneas...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <Phone className="w-10 h-10 text-gray-500 mb-3" />
        <p className="text-sm text-gray-300">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <table className="w-full min-w-[800px] text-xs">
      <thead className={registryTableHead}>
        <tr className={registryTableHeadRow}>
          <th className="px-5 py-3 text-left font-semibold">Línea</th>
          {mode === "admin" && <th className="px-4 py-3 text-left font-semibold">Cliente</th>}
          <th className="px-4 py-3 text-left font-semibold">País</th>
          {mode === "admin" && <th className="px-4 py-3 text-left font-semibold">Agente</th>}
          <th className="px-4 py-3 text-left font-semibold">Proveedor</th>
          <th className="px-4 py-3 text-left font-semibold">Estado</th>
          {mode === "admin" && onRelease && (
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className={registryTableRow}>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className={registryRowIcon}>
                  <Phone className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-mono font-medium text-white">{row.e164}</span>
              </div>
            </td>
            {mode === "admin" && (
              <td className="px-4 py-3.5 text-gray-300">{row.clientName ?? "—"}</td>
            )}
            <td className="px-4 py-3.5 text-gray-300">{countryLabel(row.country_code)}</td>
            {mode === "admin" && (
              <td className={`px-4 py-3.5 ${textMuted}`}>{row.agentName ?? "—"}</td>
            )}
            <td className="px-4 py-3.5 text-gray-400 uppercase text-[10px]">{row.provider}</td>
            <td className="px-4 py-3.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                {row.status}
              </span>
            </td>
            {mode === "admin" && onRelease && (
              <td className="px-4 py-3.5 text-right">
                <button
                  onClick={e => { e.stopPropagation(); onRelease(row.id, row.e164); }}
                  disabled={releasingId === row.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {releasingId === row.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Liberar
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
