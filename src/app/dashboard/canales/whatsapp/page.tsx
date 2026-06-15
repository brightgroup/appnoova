"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Clock, FileText } from "lucide-react";
import {
  btnGhost,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCellFirst,
  registryTableCell,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { getAuthHeaders } from "@/lib/text-agents-api";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { TextAgentListItem } from "@/types/text-agent";

function statusBadge(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300";
  if (status === "suspended") return "bg-red-500/15 text-red-300";
  return "bg-amber-500/15 text-amber-300";
}

function statusText(status: string) {
  if (status === "active") return "Activo";
  if (status === "suspended") return "Suspendido";
  return "Pendiente";
}

export default function WhatsAppListPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dbReady, setDbReady] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [chRes, agentsRes] = await Promise.all([
        fetch("/api/whatsapp/channels", { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const chData = await chRes.json();
      const agentsData = await agentsRes.json();
      if (chRes.ok) {
        setChannels(chData.channels ?? []);
        setDbReady(chData.dbReady !== false);
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  const filtered = channels.filter(ch => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const agent = ch.text_agent_id ? agentMap.get(ch.text_agent_id) ?? "" : "";
    return (
      ch.e164.includes(q) ||
      (ch.friendly_name ?? "").toLowerCase().includes(q) ||
      agent.toLowerCase().includes(q)
    );
  });

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <ChannelListPage
      title="WhatsApp"
      description="Líneas WhatsApp Business conectadas. Asigne un agente de texto a cada línea."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar número o agente"
      onRefresh={load}
      refreshing={loading}
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/canales/whatsapp/plantillas" className={btnGhost}>
            <FileText className="w-4 h-4" /> Plantillas
          </Link>
          <Link href="/?solicitar=acceso" className={`${btnGhost} opacity-90`}>
            <Plus className="w-4 h-4" /> Solicitar línea
          </Link>
        </div>
      }
      footer={
        filtered.length > 0 ? (
          <RegistryTablePagination
            total={pagination.total}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            pageSafe={pagination.pageSafe}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            label="líneas"
          />
        ) : undefined
      }
    >
      {!dbReady && (
        <div className="mx-6 mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Falta la migración de WhatsApp en Supabase (021_whatsapp_channels.sql).
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={registryTableEmpty}>
          <MessageCircle className="w-10 h-10 text-emerald-500/50 mb-3 mx-auto" />
          <p className="text-sm text-gray-400 mb-2 max-w-md mx-auto">
            {search
              ? "No hay resultados"
              : "Aún no hay líneas de WhatsApp conectadas. Solicite activación y nuestro equipo registrará su número."}
          </p>
          {!search && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[.04] border border-white/[.08] text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              Fase 0 — activación asistida
            </div>
          )}
        </div>
      ) : (
        <table className={`${registryTable} min-w-[720px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Línea</th>
              <th className={registryTableHeadCell}>Número</th>
              <th className={registryTableHeadCell}>Agente</th>
              <th className={registryTableHeadCell}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(ch => (
              <tr
                key={ch.id}
                className={registryTableRowClickable}
                onClick={() => router.push(`/dashboard/canales/whatsapp/${ch.id}`)}
              >
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-white">
                      {ch.friendly_name || "WhatsApp"}
                    </span>
                  </div>
                </td>
                <td className={`${registryTableCell} font-mono text-sm`}>{ch.e164}</td>
                <td className={registryTableCell}>
                  {ch.text_agent_id ? agentMap.get(ch.text_agent_id) ?? "—" : "Sin asignar"}
                </td>
                <td className={registryTableCell}>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${statusBadge(ch.status)}`}
                  >
                    {statusText(ch.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
