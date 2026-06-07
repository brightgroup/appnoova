"use client";

import { Clock, Loader2, Phone, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";
import {
  registryRowIcon, registryTableHead, registryTableHeadRow, registryTableRow, textMuted, btnPrimarySm
} from "@/lib/brand-ui";
import { countryLabel } from "@/lib/telephony/countries";
import type { PhoneLineRequestAdminRow, PhoneLineRequestStatus } from "@/types/phone-line-request";

interface PhoneLineRequestsTableProps {
  rows: PhoneLineRequestAdminRow[];
  loading?: boolean;
  updatingId?: string | null;
  onAttend?: (row: PhoneLineRequestAdminRow) => void;
  onUpdateStatus?: (id: string, status: PhoneLineRequestStatus) => void;
}

function requestTypeLabel(type: string): string {
  if (type === "verify_outbound") return "Verificar outbound";
  return "Comprar línea";
}

function statusBadge(status: PhoneLineRequestStatus) {
  const map: Record<PhoneLineRequestStatus, { label: string; cls: string }> = {
    pending: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-300" },
    in_progress: { label: "En proceso", cls: "bg-blue-500/15 text-blue-300" },
    completed: { label: "Completada", cls: "bg-emerald-500/15 text-emerald-400" },
    rejected: { label: "Rechazada", cls: "bg-red-500/15 text-red-400" }
  };
  const s = map[status] ?? { label: status, cls: "bg-white/10 text-gray-300" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function PhoneLineRequestsTable({
  rows,
  loading,
  updatingId,
  onAttend,
  onUpdateStatus
}: PhoneLineRequestsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando solicitudes...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <Clock className="w-10 h-10 text-gray-500 mb-3" />
        <p className="text-sm text-gray-300">No hay solicitudes de clientes.</p>
        <p className={`text-xs ${textMuted} mt-1`}>Cuando un cliente pida una línea, aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <table className="w-full min-w-[960px] text-xs">
      <thead className={registryTableHead}>
        <tr className={registryTableHeadRow}>
          <th className="px-5 py-3 text-left font-semibold">Fecha</th>
          <th className="px-4 py-3 text-left font-semibold">Cliente</th>
          <th className="px-4 py-3 text-left font-semibold">Tipo</th>
          <th className="px-4 py-3 text-left font-semibold">País</th>
          <th className="px-4 py-3 text-left font-semibold">Detalle</th>
          <th className="px-4 py-3 text-left font-semibold">Agente</th>
          <th className="px-4 py-3 text-left font-semibold">Estado</th>
          <th className="px-4 py-3 text-right font-semibold">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className={registryTableRow}>
            <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{formatDate(row.created_at)}</td>
            <td className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className={registryRowIcon}>
                  <Phone className="w-3.5 h-3.5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{row.client_name || "—"}</p>
                  <p className={`text-[11px] ${textMuted}`}>{row.client_email}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3.5 text-gray-300">{requestTypeLabel(row.request_type)}</td>
            <td className="px-4 py-3.5 text-gray-300">
              {row.country_code ? countryLabel(row.country_code) : "—"}
            </td>
            <td className="px-4 py-3.5 text-gray-300 max-w-[200px]">
              {row.phone_e164 && (
                <p className="font-mono text-white text-[11px]">{row.phone_e164}</p>
              )}
              {row.notes && (
                <p className={`text-[11px] ${textMuted} line-clamp-2 mt-0.5`}>{row.notes}</p>
              )}
              {!row.phone_e164 && !row.notes && "—"}
            </td>
            <td className={`px-4 py-3.5 ${textMuted}`}>{row.agent_name ?? "—"}</td>
            <td className="px-4 py-3.5">{statusBadge(row.status)}</td>
            <td className="px-4 py-3.5 text-right">
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                {row.status === "pending" && row.request_type === "purchase_line" && onAttend && (
                  <button
                    onClick={() => onAttend(row)}
                    disabled={updatingId === row.id}
                    className={btnPrimarySm}
                  >
                    {updatingId === row.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShoppingCart className="w-3 h-3" />
                    )}
                    Atender
                  </button>
                )}
                {(row.status === "pending" || row.status === "in_progress") && onUpdateStatus && (
                  <>
                    <button
                      onClick={() => onUpdateStatus(row.id, "completed")}
                      disabled={updatingId === row.id}
                      title="Marcar completada"
                      className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onUpdateStatus(row.id, "rejected")}
                      disabled={updatingId === row.id}
                      title="Rechazar"
                      className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
