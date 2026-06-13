"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Clock, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnGhost,
  registryContent,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  textMuted
} from "@/lib/brand-ui";
import {
  templateStatusColor,
  templateStatusLabel
} from "@/lib/whatsapp/template-record";
import type { WhatsAppTemplateStatus } from "@/types/whatsapp-template";

interface PendingRow {
  id: string;
  template_name: string;
  status: string;
  category: string;
  body_source: string | null;
  body_preview: string;
  updated_at: string;
  rejection_reason: string | null;
  channel_e164: string | null;
  user_email: string | null;
  user_nombre: string | null;
}

export default function AdminWhatsAppPendingTemplatesPage() {
  const [templates, setTemplates] = useState<PendingRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending_approval" | "all_pending">("pending_approval");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/admin/whatsapp/templates?status=${filter}`);
    const data = await res.json();
    if (res.ok) {
      setTemplates(data.templates ?? []);
      setPendingCount(data.pending_count ?? 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/whatsapp" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Aprobaciones pendientes
                {pendingCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                    {pendingCount}
                  </span>
                )}
              </h1>
              <p className={`${textMuted} text-xs mt-0.5`}>
                Plantillas enviadas por clientes en revisión con Meta
              </p>
            </div>
          </div>
          <button type="button" onClick={load} className={btnGhost}>
            Actualizar
          </button>
        </div>
      </div>

      <div className={registryContent}>
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setFilter("pending_approval")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "pending_approval"
                ? "bg-amber-500/15 text-amber-200"
                : "text-gray-400 hover:text-white hover:bg-white/[.06]"
            }`}
          >
            En revisión
          </button>
          <button
            type="button"
            onClick={() => setFilter("all_pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "all_pending"
                ? "bg-amber-500/15 text-amber-200"
                : "text-gray-400 hover:text-white hover:bg-white/[.06]"
            }`}
          >
            Incluir rechazadas
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-gray-500">
              {filter === "pending_approval"
                ? "No hay plantillas en revisión en este momento."
                : "No hay plantillas pendientes ni rechazadas."}
            </p>
          </div>
        ) : (
          <table className={`${registryTable} min-w-full`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Plantilla</th>
                <th className={registryTableHeadCell}>Cliente</th>
                <th className={registryTableHeadCell}>Línea</th>
                <th className={registryTableHeadCell}>Estado</th>
                <th className={registryTableHeadCell}>Enviada</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <tr key={tpl.id} className="border-b border-white/[.06]">
                  <td className={`${registryTableCell} text-sm`}>
                    <div className="font-medium text-white">{tpl.template_name}</div>
                    <div className={`${textMuted} text-xs mt-1 line-clamp-2 max-w-sm`}>
                      {tpl.body_source ?? tpl.body_preview}
                    </div>
                    {tpl.rejection_reason && (
                      <p className="text-xs text-red-300 mt-1">{tpl.rejection_reason}</p>
                    )}
                  </td>
                  <td className={`${registryTableCell} text-xs text-gray-300`}>
                    <div>{tpl.user_nombre || "—"}</div>
                    <div className="text-gray-500">{tpl.user_email}</div>
                  </td>
                  <td className={`${registryTableCell} font-mono text-xs text-gray-300`}>
                    {tpl.channel_e164 ?? "—"}
                  </td>
                  <td className={registryTableCell}>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${templateStatusColor(tpl.status as WhatsAppTemplateStatus)}`}
                    >
                      {templateStatusLabel(tpl.status as WhatsAppTemplateStatus)}
                    </span>
                  </td>
                  <td className={`${registryTableCell} text-xs text-gray-400`}>
                    {tpl.updated_at
                      ? new Date(tpl.updated_at).toLocaleString("es", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
