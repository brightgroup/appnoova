"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, MoreVertical, ChevronLeft, Mic, PhoneCall, Loader2, Trash2, RefreshCw, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import {
  btnPrimary, btnIcon, btnIconSm, registryPage, registryContent, registryRowIcon,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRowClickable, registryTableCell, registryTableCellFirst, registryTableCellRight,
  registryTableLoading, registryTableEmpty, registryToolbar, textMuted
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { supabase } from "@/lib/supabase";
import {
  formatContactedLine,
  formatCostPerResult,
  formatCostUsd,
  qualityBadgeVariant
} from "@/lib/voice-agent-display";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { Badge } from "@/components/ui/Badge";
import { AgentCreationWizard } from "@/components/agents/AgentCreationWizard";
import type { VoiceAgentListItem } from "@/types/voice-agent";

export default function AgentesVozPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { canWrite } = useModuleWriteAccess("voice_agents", "edit");
  const { canWrite: canDelete } = useModuleWriteAccess("voice_agents", "manage");
  const [searchTerm, setSearchTerm] = useState("");
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [listError, setListError] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [menuAgentId, setMenuAgentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VoiceAgentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true);
    setListError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setListError("Sesión no disponible. Recarga la página o vuelve a iniciar sesión.");
        setAgents([]);
        return;
      }

      const headers = await getAuthHeaders();
      const res = await fetch("/api/voice/agents", {
        headers,
        cache: "no-store"
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "No se pudieron cargar los agentes");
        setAgents([]);
        return;
      }
      if (data.dbReady === false) {
        setListError("Configura la tabla voice_agents en Supabase (migración 001).");
        setAgents([]);
        return;
      }
      setAgents(data.agents ?? []);
    } catch {
      setListError("Error de red al cargar agentes");
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    if (pathname !== "/dashboard/agentes-voz") return;

    loadAgents();

    const onFocus = () => loadAgents();
    window.addEventListener("focus", onFocus);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAgents();
    });

    return () => {
      window.removeEventListener("focus", onFocus);
      subscription.unsubscribe();
    };
  }, [pathname, loadAgents]);

  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pagination = useRegistryPagination(filteredAgents.length, searchTerm);
  const pageRows = pagination.pageRows(filteredAgents);

  const openAgent = (id: string) => {
    router.push(`/dashboard/agentes-voz/configuracion?id=${id}`);
  };

  const handleDeleteAgent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/voice/agents?id=${deleteTarget.id}`, {
        method: "DELETE",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || "No se pudo eliminar el agente");
        return;
      }
      setAgents(prev => prev.filter(a => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      setMenuAgentId(null);
    } catch {
      setListError("Error de red al eliminar el agente");
    }
    setDeleting(false);
  };

  const handleAgentCreated = (agentId: string) => {
    void loadAgents();
    router.push(`/dashboard/agentes-voz/configuracion?id=${agentId}&tab=probar`);
  };

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 hover:bg-white/[.06] rounded-lg transition-colors text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Agentes de Voz</h1>
            <p className={`text-xs ${textMuted} mt-0.5 max-w-xl truncate`}>
              Agentes IA para llamadas, recordatorios, calificación y atención
            </p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        <RegistryTableLayout
          search={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar"
          onRefresh={loadAgents}
          refreshing={loadingAgents}
          action={
            canWrite ? (
              <button onClick={() => setShowWizard(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Nuevo agente
              </button>
            ) : undefined
          }
          error={listError ? (
            <>
              <p className="font-semibold text-red-200 mb-1">No se pudo cargar la lista</p>
              <p className="text-xs leading-relaxed">{listError}</p>
              {listError.includes("migración") && (
                <p className="text-[11px] text-red-400/80 mt-2">
                  Abre Supabase → SQL Editor y ejecuta el archivo <code className="text-red-200">supabase/APPLY_IN_SUPABASE.sql</code>
                </p>
              )}
            </>
          ) : undefined}
          footer={!loadingAgents && filteredAgents.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="agentes"
            />
          ) : undefined}
        >
        {loadingAgents ? (
          <div className={registryTableLoading}>
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando agentes...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className={registryTableEmpty}>
            {searchTerm
              ? "No se encontraron agentes con ese nombre"
              : "Aún no tienes agentes. Crea uno con «Nuevo agente»."}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[900px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Agente</th>
                <th className={`${registryTableHeadCell} text-right`}>Contactos</th>
                <th className={`${registryTableHeadCell} text-right`}>Contactados</th>
                <th className={`${registryTableHeadCell} text-right`}>Llamadas</th>
                <th className={`${registryTableHeadCell} text-right`}>Metas</th>
                <th className={`${registryTableHeadCell} text-right`}>Costo</th>
                <th className={`${registryTableHeadCell} text-right`}>Costo / Resultado</th>
                <th className={`${registryTableHeadCell} text-right`}>Calidad</th>
                <th className={`${registryTableHeadCell} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((agent) => {
                const meta = getTemplateMeta(agent.source_template);
                return (
                  <tr
                    key={agent.id}
                    onClick={() => openAgent(agent.id)}
                    className={registryTableRowClickable}
                  >
                    <td className={registryTableCellFirst}>
                      <div className="flex items-center gap-3">
                        <PhoneCall className={`w-3.5 h-3.5 ${registryRowIcon}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{agent.name}</div>
                          <div className="text-[10px] text-gray-400 font-normal mt-0.5">{meta.tag} · {meta.description.slice(0, 36)}…</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>{agent.contacts_count}</td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {formatContactedLine(agent.contacted_count, agent.contacts_count)}
                    </td>
                    <td className={`${registryTableCell} text-gray-100 text-right tabular-nums font-medium`}>{agent.calls_count}</td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>{agent.goals_achieved}</td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>{formatCostUsd(agent.cost_usd)}</td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {formatCostPerResult(agent.cost_usd, agent.goals_achieved)}
                    </td>
                    <td className={registryTableCellRight}>
                      <Badge variant={qualityBadgeVariant(agent.quality_label)}>{agent.quality_label}</Badge>
                    </td>
                    <td className={`${registryTableCell} text-center`} onClick={e => e.stopPropagation()}>
                      <NoovaAnchoredMenu
                        open={menuAgentId === agent.id}
                        onClose={() => setMenuAgentId(null)}
                        menuClassName="min-w-[160px]"
                        anchor={
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMenuAgentId(prev => (prev === agent.id ? null : agent.id));
                            }}
                            className={btnIconSm}
                            title="Acciones"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        }
                      >
                        <NoovaListMenuItem onClick={() => openAgent(agent.id)}>
                          Abrir configuración
                        </NoovaListMenuItem>
                        {canDelete && (
                          <NoovaListMenuItem
                            danger
                            onClick={() => {
                              setMenuAgentId(null);
                              setDeleteTarget(agent);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar agente
                            </span>
                          </NoovaListMenuItem>
                        )}
                      </NoovaAnchoredMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </RegistryTableLayout>
      </div>

      {/* Confirm delete agent */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-noova-surface border border-white/[.10] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar agente</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              ¿Eliminar <strong className="text-white">{deleteTarget.name}</strong>? Se borrarán también
              sus llamadas registradas. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-60 flex items-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AgentCreationWizard
        channel="voice"
        open={showWizard && canWrite}
        onClose={() => setShowWizard(false)}
        onCreated={handleAgentCreated}
        getAuthHeaders={getAuthHeaders}
        apiPath="/api/voice/agents"
      />
    </div>
  );
}
