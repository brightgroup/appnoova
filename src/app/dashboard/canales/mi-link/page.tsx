"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Plus } from "lucide-react";
import { btnPrimary, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableRowClickable, registryTableCellFirst, registryTableCell, registryTableEmpty } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { buildMicrositePublicUrl } from "@/lib/microsite-slug";
import type { BrokerMicrositeRecord } from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";

export default function MiLinkListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [microsite, setMicrosite] = useState<BrokerMicrositeRecord | null>(null);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [siteRes, agentsRes] = await Promise.all([
        fetch("/api/microsite", { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const siteData = await siteRes.json();
      const agentsData = await agentsRes.json();
      if (siteRes.ok && siteData.microsite) {
        setMicrosite(siteData.microsite as BrokerMicrositeRecord);
      } else {
        setMicrosite(null);
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const agentName = microsite?.text_agent_id
    ? agents.find(a => a.id === microsite.text_agent_id)?.name ?? "—"
    : "Sin agente";

  const displayName = microsite?.agent_display_name?.trim() || agentName;
  const publicUrl = microsite ? buildMicrositePublicUrl(microsite.slug) : "";
  const matchesSearch =
    !search.trim() ||
    displayName.toLowerCase().includes(search.toLowerCase()) ||
    microsite?.slug.toLowerCase().includes(search.toLowerCase());

  return (
    <ChannelListPage
      title="Mi Link"
      description="Un micrositio público de chat con su marca. Solo se permite un link por cuenta."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      onRefresh={load}
      refreshing={loading}
      action={
        !microsite ? (
          <Link href="/dashboard/canales/mi-link/nuevo" className={btnPrimary}>
            <Plus className="w-4 h-4" /> Crear mi link
          </Link>
        ) : undefined
      }
      footer={microsite ? <span>1 canal · máximo permitido</span> : undefined}
    >
      {!microsite ? (
        <div className={registryTableEmpty}>
          <Link2 className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
          <p className="mb-4">Aún no tienes un Mi Link configurado.</p>
          <Link href="/dashboard/canales/mi-link/nuevo" className={btnPrimary}>
            <Plus className="w-4 h-4" /> Crear mi link
          </Link>
        </div>
      ) : !matchesSearch ? (
        <div className={registryTableEmpty}>No hay resultados para «{search}»</div>
      ) : (
        <table className={`${registryTable} min-w-[720px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Canal</th>
              <th className={registryTableHeadCell}>URL</th>
              <th className={registryTableHeadCell}>Agente</th>
              <th className={registryTableHeadCell}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              className={registryTableRowClickable}
              onClick={() => router.push("/dashboard/canales/mi-link/configuracion")}
            >
              <td className={registryTableCellFirst}>
                <div className="flex items-center gap-3">
                  <Link2 className="w-4 h-4 text-[#99c9ff]" />
                  <div>
                    <div className="text-sm font-medium text-white">{displayName}</div>
                    <div className="text-[10px] text-gray-500 font-mono">/{microsite.slug}</div>
                  </div>
                </div>
              </td>
              <td className={`${registryTableCell} font-mono text-xs text-gray-300 max-w-[200px] truncate`}>
                {publicUrl}
              </td>
              <td className={registryTableCell}>{agentName}</td>
              <td className={registryTableCell}>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  microsite.is_published
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}>
                  {microsite.is_published ? "Publicado" : "Borrador"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
