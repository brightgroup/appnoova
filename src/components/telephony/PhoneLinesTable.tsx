"use client";

import { Phone, Trash2, Loader2, ArrowRightLeft } from "lucide-react";
import {
  registryRowIcon, registryTable, registryTableHead, registryTableHeadRow,
  registryTableHeadCell, registryTableRow, registryTableCell, registryTableCellFirst,
  registryTableCellMuted, registryTableCellRight, registryTableLoading, registryTableEmpty
} from "@/lib/brand-ui";
import { countryLabel } from "@/lib/telephony/countries";
import { numberUsageLabel, numberUsageBadgeClass } from "@/lib/telephony/number-type-labels";
import type { PhoneNumberType } from "@/types/phone-number";

export interface PhoneLineRow {
  id: string;
  e164: string;
  friendly_name?: string | null;
  country_code: string;
  number_type?: PhoneNumberType | string;
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
  onTransfer?: (row: PhoneLineRow) => void;
  releasingId?: string | null;
}

export function PhoneLinesTable({
  rows,
  mode,
  loading,
  emptyMessage = "No hay líneas todavía.",
  onRelease,
  onTransfer,
  releasingId
}: PhoneLinesTableProps) {
  if (loading) {
    return (
      <div className={registryTableLoading}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando líneas...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={`${registryTableEmpty} px-6`}>
        <Phone className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <table className={`${registryTable} min-w-[800px]`}>
      <thead className={registryTableHead}>
        <tr className={registryTableHeadRow}>
          {mode === "client" && <th className={registryTableHeadCell}>Nombre</th>}
          <th className={registryTableHeadCell}>Número</th>
          {mode === "admin" && <th className={registryTableHeadCell}>Cliente</th>}
          <th className={registryTableHeadCell}>País</th>
          <th className={registryTableHeadCell}>Uso</th>
          {mode === "admin" && <th className={registryTableHeadCell}>Agente</th>}
          <th className={registryTableHeadCell}>Proveedor</th>
          <th className={registryTableHeadCell}>Estado</th>
          {mode === "admin" && (onRelease || onTransfer) && (
            <th className={`${registryTableHeadCell} text-right`}>Acciones</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const usageType = row.number_type ?? "purchased";
          return (
            <tr key={row.id} className={registryTableRow}>
              {mode === "client" && (
                <td className={`${registryTableCellFirst} text-sm font-medium text-white`}>
                  {row.friendly_name || "—"}
                </td>
              )}
              <td className={mode === "client" ? registryTableCell : registryTableCellFirst}>
                <div className="flex items-center gap-3">
                  <Phone className={`w-3.5 h-3.5 ${registryRowIcon}`} />
                  <span className="text-sm font-mono font-medium text-white">{row.e164}</span>
                </div>
              </td>
              {mode === "admin" && (
                <td className={`${registryTableCell} text-gray-300`}>{row.clientName ?? "—"}</td>
              )}
              <td className={`${registryTableCell} text-gray-300`}>{countryLabel(row.country_code)}</td>
              <td className={registryTableCell}>
                <span className={`text-xs px-2 py-0.5 rounded-full ${numberUsageBadgeClass(usageType)}`}>
                  {numberUsageLabel(usageType)}
                </span>
              </td>
              {mode === "admin" && (
                <td className={registryTableCellMuted}>{row.agentName ?? "—"}</td>
              )}
              <td className={`${registryTableCell} text-gray-400 uppercase text-[10px]`}>{row.provider}</td>
              <td className={registryTableCell}>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                  {row.status}
                </span>
              </td>
              {mode === "admin" && (onRelease || onTransfer) && (
                <td className={registryTableCellRight}>
                  <div className="inline-flex items-center gap-1">
                    {onTransfer && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onTransfer(row);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#5b5bf6] hover:bg-[#5b5bf6]/10"
                        title="Transferir a otro cliente"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        Transferir
                      </button>
                    )}
                    {onRelease && (
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
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
