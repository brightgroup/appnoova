"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Plus, Trash2 } from "lucide-react";
import { btnPrimary, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableRowClickable, registryTableCellFirst, registryTableCell, registryTableEmpty } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { buildMicrositePublicUrl } from "@/lib/microsite-slug";
import type { BrokerMicrositeRecord } from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";

interface LinkLimit {
  used: number;
  max: number | null;
  remaining: number | null;
}

export default function MiLinkListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [microsites, setMicrosites] = useState<BrokerMicrositeRecord[]>([]);
  const [linkLimit, setLinkLimit] = useState<LinkLimit | null>(null);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
      if (siteRes.ok) {
        setMicrosites((siteData.microsites ?? []) as BrokerMicrositeRecord[]);
        if (siteData.links) {
          setLinkLimit({
            used: siteData.links.used ?? 0,
            max: siteData.links.max ?? null,
            remaining: siteData.links.remaining ?? null
          });
        }
      } else {
        setMicrosites([]);
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/microsite?id=${id}`, { method: "DELETE", headers });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = microsites.filter(m => {
    if (!search.trim()) return true;
    const agentName = m.text_agent_id ? agents.find(a => a.id === m.text_agent_id)?.name ?? "" : "";
    const displayName = m.agent_display_name?.trim() || agentName;
    return (
      displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.toLowerCase().includes(search.toLowerCase())
    );
  });

  const linksFull = linkLimit?.remaining === 0;
  const footerText = linkLimit
    ? linkLimit.max != null
      ? `${linkLimit.used}/${linkLimit.max} links del plan${linksFull ? " · límite alcanzado" : ""}`
      : "links ilimitados"
    : undefined;

  return (
    <ChannelListPage
      title="Mi Link"
      description="Micrositios públicos de chat con su marca. El cupo depende de su plan."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      onRefresh={load}
      refreshing={loading}
      action={
        !linksFull ? (
          <Link href="/dashboard/canales/mi-link/nuevo" className={btnPrimary}>
            <Plus className="w-4 h-4" /> Crear mi link
          </Link>
        ) : undefined
      }
      footer={footerText ? <span>{footerText}</span> : undefined}
      alerts={
        linksFull ? (
          <div className="mb-4 p-4 rounded-xl border border-amber-500/25 bg-amber-500/10">
            <p className="text-sm text-amber-200">
              Tu plan permite hasta {linkLimit?.max} Mi Links y ya están en uso. Para crear más,{" "}
              <Link href="/dashboard/facturacion" className="text-[#0f7eff] hover:underline font-medium">
                actualiza el plan en Facturación
              </Link>
              .
            </p>
          </div>
        ) : undefined
      }
    >
      {microsites.length === 0 ? (
        <div className={registryTableEmpty}>
          <Link2 className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
          <p className="mb-4">Aún no tienes ningún Mi Link configurado.</p>
          <Link href="/dashboard/canales/mi-link/nuevo" className={btnPrimary}>
            <Plus className="w-4 h-4" /> Crear mi link
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className={registryTableEmpty}>No hay resultados para «{search}»</div>
      ) : (
        <table className={`${registryTable} min-w-[720px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Canal</th>
              <th className={registryTableHeadCell}>URL</th>
              <th className={registryTableHeadCell}>Agente</th>
              <th className={registryTableHeadCell}>Estado</th>
              <th className={registryTableHeadCell}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(microsite => {
              const agentName = microsite.text_agent_id
                ? agents.find(a => a.id === microsite.text_agent_id)?.name ?? "—"
                : "Sin agente";
              const displayName = microsite.agent_display_name?.trim() || agentName;
              const publicUrl = buildMicrositePublicUrl(microsite.slug);

              return (
                <tr
                  key={microsite.id}
                  className={registryTableRowClickable}
                  onClick={() => router.push(`/dashboard/canales/mi-link/configuracion?id=${microsite.id}`)}
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
                  <td className={registryTableCell}>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDelete(microsite.id);
                      }}
                      disabled={busyId === microsite.id}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
