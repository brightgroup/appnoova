"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Plus } from "lucide-react";
import { btnPrimary, btnGhost, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableRowClickable, registryTableCellFirst, registryTableCell, registryTableEmpty } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { countryLabel } from "@/lib/telephony/countries";
import { numberUsageLabel } from "@/lib/telephony/number-type-labels";
import type { PhoneNumberRecord } from "@/types/phone-number";
import type { VoiceAgentListItem } from "@/types/voice-agent";
import { ClientLineWizard } from "@/components/telephony/ClientLineWizard";

export default function TelefonoListPage() {
  const router = useRouter();
  const [lines, setLines] = useState<PhoneNumberRecord[]>([]);
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [linesRes, agentsRes] = await Promise.all([
        fetch("/api/telephony/numbers", { headers }),
        fetch("/api/voice/agents", { headers })
      ]);
      const linesData = await linesRes.json();
      const agentsData = await agentsRes.json();
      if (linesRes.ok) setLines(linesData.phone_numbers ?? []);
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

  const filtered = lines.filter(l => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const agent = l.voice_agent_id ? agentMap.get(l.voice_agent_id) ?? "" : "";
    return (
      l.e164.includes(q) ||
      (l.friendly_name ?? "").toLowerCase().includes(q) ||
      agent.toLowerCase().includes(q)
    );
  });

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <>
      <ChannelListPage
        title="Teléfono"
        description="Líneas telefónicas para agentes de voz. Puede gestionar varias líneas y asignarlas a distintos agentes."
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar número o agente"
        onRefresh={load}
        refreshing={loading}
        action={
          <>
            <button onClick={() => setShowWizard(true)} className={btnGhost}>
              <Plus className="w-4 h-4" /> Vincular línea
            </button>
            <button onClick={() => setShowWizard(true)} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Solicitar línea
            </button>
          </>
        }
        footer={filtered.length > 0 ? (
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
        ) : undefined}
      >
        {filtered.length === 0 ? (
          <div className={registryTableEmpty}>
            <Phone className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
            <p className="mb-4">{search ? "No hay resultados" : "Aún no tienes líneas telefónicas."}</p>
            {!search && (
              <button onClick={() => setShowWizard(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Solicitar línea
              </button>
            )}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[800px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Línea</th>
                <th className={registryTableHeadCell}>Número</th>
                <th className={registryTableHeadCell}>País</th>
                <th className={registryTableHeadCell}>Uso</th>
                <th className={registryTableHeadCell}>Agente</th>
                <th className={registryTableHeadCell}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(line => (
                <tr
                  key={line.id}
                  className={registryTableRowClickable}
                  onClick={() => router.push(`/dashboard/canales/telefono/${line.id}`)}
                >
                  <td className={registryTableCellFirst}>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-[#a5a5ff]" />
                      <span className="text-sm font-medium text-white">
                        {line.friendly_name || "Línea telefónica"}
                      </span>
                    </div>
                  </td>
                  <td className={`${registryTableCell} font-mono text-sm`}>{line.e164}</td>
                  <td className={registryTableCell}>{countryLabel(line.country_code)}</td>
                  <td className={registryTableCell}>{numberUsageLabel(line.number_type ?? "purchased")}</td>
                  <td className={registryTableCell}>
                    {line.voice_agent_id ? agentMap.get(line.voice_agent_id) ?? "—" : "Sin asignar"}
                  </td>
                  <td className={registryTableCell}>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-white/[.06] text-gray-300">
                      {line.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <ClientLineWizard open={showWizard} onClose={() => setShowWizard(false)} onSuccess={load} />
    </>
  );
}
