"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Code2 } from "lucide-react";
import { btnPrimary, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableRowClickable, registryTableCellFirst, registryTableCell, registryTableEmpty } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { buildWidgetPageUrl } from "@/lib/microsite-slug";
import type { BrokerWebWidgetRecord } from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";

export default function WidgetListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [widget, setWidget] = useState<BrokerWebWidgetRecord | null>(null);
  const [slug, setSlug] = useState("");
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [widgetRes, agentsRes] = await Promise.all([
        fetch("/api/widget", { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const widgetData = await widgetRes.json();
      const agentsData = await agentsRes.json();

      if (widgetRes.ok && widgetData.widget) {
        const record = widgetData.widget as BrokerWebWidgetRecord;
        setWidget(record);
        setSlug(record.slug);
      } else {
        setWidget(null);
        setSlug("");
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const agentName = widget?.text_agent_id
    ? agents.find(a => a.id === widget.text_agent_id)?.name ?? "—"
    : "Sin agente";

  const ready = Boolean(widget?.is_published && widget?.text_agent_id);
  const widgetUrl = slug ? buildWidgetPageUrl(slug) : "";
  const matchesSearch = !search.trim() || "widget".includes(search.toLowerCase()) || slug.includes(search.toLowerCase());

  return (
    <ChannelListPage
      title="Widget web"
      description="Burbuja de chat embebible. Canal independiente de Mi Link: slug, agente, estilo y publicación propios."
      loading={loading}
      tableDescription="Haga clic en el widget para ver el código de instalación y configuración."
      search={search}
      onSearchChange={setSearch}
      onRefresh={load}
      refreshing={loading}
      footer={widget ? <span>1 canal · máximo permitido</span> : undefined}
    >
      {!widget ? (
        <div className={registryTableEmpty}>
          <Code2 className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
          <p className="mb-4">Crea tu widget para configurar agente, estilos y código de instalación.</p>
          <Link href="/dashboard/canales/widget/nuevo" className={btnPrimary}>
            Crear widget
          </Link>
        </div>
      ) : !matchesSearch ? (
        <div className={registryTableEmpty}>No hay resultados</div>
      ) : (
        <table className={`${registryTable} min-w-[720px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Canal</th>
              <th className={registryTableHeadCell}>Slug</th>
              <th className={registryTableHeadCell}>Agente</th>
              <th className={registryTableHeadCell}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              className={registryTableRowClickable}
              onClick={() => router.push("/dashboard/canales/widget/configuracion")}
            >
              <td className={registryTableCellFirst}>
                <div className="flex items-center gap-3">
                  <Code2 className="w-4 h-4 text-cyan-300" />
                  <div>
                    <div className="text-sm font-medium text-white">Widget embebible</div>
                    <div className="text-[10px] text-gray-500 font-mono truncate max-w-[220px]">{widgetUrl}</div>
                  </div>
                </div>
              </td>
              <td className={`${registryTableCell} font-mono text-xs`}>/{slug}</td>
              <td className={registryTableCell}>{agentName}</td>
              <td className={registryTableCell}>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  ready ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                }`}>
                  {ready ? "Publicado" : "Borrador"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
