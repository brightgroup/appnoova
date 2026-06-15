"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, MoreVertical, ChevronLeft, MessageSquare, Sparkles, ArrowRight,
  Loader2, Trash2, UserCheck, TrendingUp
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnPrimary, btnIconSm, registryPage, registryContent, registryRowIcon,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRowClickable, registryTableCell, registryTableCellFirst, registryTableCellRight,
  registryTableLoading, registryTableEmpty, registryToolbar, textMuted
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { NoovaListMenu, NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { supabase } from "@/lib/supabase";
import {
  formatCostPerResult,
  formatCostUsd,
  qualityBadgeClass,
  formatMessagesPerConversation
} from "@/lib/text-agent-display";
import { getTextTemplateMeta } from "@/lib/text-agent-templates";
import type { TextAgentListItem } from "@/types/text-agent";

const AGENT_TEMPLATES = [
  {
    id: "customer-assistant",
    name: "Asistente al Cliente",
    tag: "Web",
    icon: MessageSquare,
    iconBg: "from-[#5b5bf6] to-[#7070f8]",
    ringColor: "hover:ring-[#5b5bf6]/50",
    stat: "Cotizaciones y pólizas",
    statColor: "text-[#a5a5ff]",
    desc: "Atiende clientes finales por chat: cotizaciones, consultas de pólizas y siniestros."
  },
  {
    id: "lead-qualification",
    name: "Calificación de Leads",
    tag: "Inbound",
    icon: UserCheck,
    iconBg: "from-[#1d4ed8] to-[#38bdf8]",
    ringColor: "hover:ring-[#38bdf8]/50",
    stat: "+40% conversión",
    statColor: "text-[#38bdf8]",
    desc: "Califica prospectos por chat y recopila datos clave automáticamente."
  },
  {
    id: "support-follow-up",
    name: "Seguimiento Inteligente",
    tag: "Outbound",
    icon: TrendingUp,
    iconBg: "from-[#1e40af] to-[#67e8f9]",
    ringColor: "hover:ring-[#67e8f9]/50",
    stat: "+30% reactivación",
    statColor: "text-[#67e8f9]",
    desc: "Reactiva leads sin respuesta y da seguimiento a oportunidades abiertas."
  }
];

export default function AgentesTextoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [listError, setListError] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [menuAgentId, setMenuAgentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TextAgentListItem | null>(null);
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
      const res = await fetch("/api/text/agents", {
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
    if (pathname !== "/dashboard/agentes-texto") return;

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
    router.push(`/dashboard/agentes-texto/configuracion?id=${id}`);
  };

  const handleDeleteAgent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/text/agents?id=${deleteTarget.id}`, {
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

  useEffect(() => {
    if (!menuAgentId) return;
    const close = () => setMenuAgentId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuAgentId]);

  const handleCreateFromTemplate = async (templateId: string) => {
    setCreatingAgent(true);
    setCreateError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/text/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({ source_template: templateId })
      });
      const data = await res.json();
      if (!res.ok || !data.agent?.id) {
        const msg = data.error || "No se pudo crear el agente";
        setCreateError(msg);
        setListError(msg);
        return;
      }
      setShowTemplateModal(false);
      setAgents(prev => {
        const item = data.agent;
        if (!item?.id) return prev;
        if (prev.some(a => a.id === item.id)) return prev;
        return [{
          id: item.id,
          source_template: item.source_template ?? templateId,
          name: item.name,
          conversations_count: item.conversations_count ?? 0,
          messages_count: item.messages_count ?? 0,
          goals_achieved: item.goals_achieved ?? 0,
          cost_usd: item.cost_usd ?? 0,
          quality_label: item.quality_label ?? "Aprendiendo",
          updated_at: item.updated_at ?? new Date().toISOString()
        }, ...prev];
      });
      router.push(`/dashboard/agentes-texto/configuracion?id=${data.agent.id}&tab=probar`);
    } catch {
      const msg = "Error de red al crear el agente";
      setCreateError(msg);
      setListError(msg);
    } finally {
      setCreatingAgent(false);
    }
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
            <h1 className="text-xl font-bold tracking-tight">Agentes de Texto</h1>
            <p className={`text-xs ${textMuted} mt-0.5 max-w-xl truncate`}>
              Agentes IA para chat web, WhatsApp y calificación por mensaje
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
            <button onClick={() => setShowTemplateModal(true)} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Nuevo agente
            </button>
          }
          error={listError ? (
            <>
              <p className="font-semibold text-red-200 mb-1">No se pudo cargar la lista</p>
              <p className="text-xs leading-relaxed">{listError}</p>
              {listError.includes("migración") && (
                <p className="text-[11px] text-red-400/80 mt-2">
                  Abre Supabase → SQL Editor y ejecuta{" "}
                  <code className="text-red-200">supabase/migrations/012_text_agents.sql</code>
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
          <table className={`${registryTable} min-w-[860px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Agente</th>
                <th className={`${registryTableHeadCell} text-right`}>Conversaciones</th>
                <th className={`${registryTableHeadCell} text-right`}>Mensajes</th>
                <th className={`${registryTableHeadCell} text-right`}>Msg / conv.</th>
                <th className={`${registryTableHeadCell} text-right`}>Metas</th>
                <th className={`${registryTableHeadCell} text-right`}>Costo</th>
                <th className={`${registryTableHeadCell} text-right`}>Costo / Resultado</th>
                <th className={`${registryTableHeadCell} text-right`}>Calidad</th>
                <th className={`${registryTableHeadCell} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((agent) => {
                const meta = getTextTemplateMeta(agent.source_template);
                return (
                  <tr
                    key={agent.id}
                    onClick={() => openAgent(agent.id)}
                    className={registryTableRowClickable}
                  >
                    <td className={registryTableCellFirst}>
                      <div className="flex items-center gap-3">
                        <MessageSquare className={`w-3.5 h-3.5 ${registryRowIcon}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{agent.name}</div>
                          <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                            {meta.tag} · {meta.description.slice(0, 36)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`${registryTableCell} text-gray-100 text-right tabular-nums font-medium`}>
                      {agent.conversations_count}
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {agent.messages_count}
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {formatMessagesPerConversation(agent.messages_count, agent.conversations_count)}
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {agent.goals_achieved}
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {formatCostUsd(agent.cost_usd)}
                    </td>
                    <td className={`${registryTableCell} text-gray-300 text-right tabular-nums`}>
                      {formatCostPerResult(agent.cost_usd, agent.goals_achieved)}
                    </td>
                    <td className={registryTableCellRight}>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${qualityBadgeClass(agent.quality_label)}`}>
                        {agent.quality_label}
                      </span>
                    </td>
                    <td className={`${registryTableCell} text-center relative`} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setMenuAgentId(prev => prev === agent.id ? null : agent.id);
                        }}
                        className={btnIconSm}
                        title="Acciones"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {menuAgentId === agent.id && (
                        <NoovaListMenu
                          className="absolute right-0 top-full mt-1 z-20 min-w-[160px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <NoovaListMenuItem onClick={() => openAgent(agent.id)}>
                            Abrir configuración
                          </NoovaListMenuItem>
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
                        </NoovaListMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </RegistryTableLayout>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-noova-surface border border-white/[.10] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar agente</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              ¿Eliminar <strong className="text-white">{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
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

      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="relative bg-noova-surface border border-white/[.10] rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#5b5bf6]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5b5bf6]/10 border border-[#5b5bf6]/20">
                  <Sparkles className="w-3 h-3 text-[#5b5bf6]" />
                  <span className="text-xs font-medium text-[#5b5bf6]">IA de Texto</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Elige tu plantilla</h2>
              <p className="text-sm text-gray-500 mt-1">Selecciona el tipo de agente de chat que necesitas</p>
            </div>

            <div className="relative grid grid-cols-3 gap-4 mb-6">
              {AGENT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={creatingAgent}
                    className={`group relative flex flex-col p-5 rounded-2xl bg-white/[.03] border border-white/[.08] hover:border-white/[.16] hover:bg-white/[.05] hover:ring-2 ${template.ringColor} hover:ring-offset-0 transition-all duration-200 cursor-pointer text-left disabled:opacity-60 disabled:cursor-wait`}
                  >
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-4">
                      {template.tag}
                    </span>
                    <div className={`mb-4 w-11 h-11 rounded-xl bg-gradient-to-br ${template.iconBg} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
                    </div>
                    <h3 className="font-semibold text-white text-sm leading-snug mb-2">{template.name}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed flex-1">{template.desc}</p>
                    <div className={`mt-4 text-xs font-semibold ${template.statColor}`}>
                      {template.stat}
                    </div>
                    <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 leading-relaxed">
                {createError}
              </div>
            )}

            {creatingAgent && (
              <div className="mb-4 flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Creando agente...
              </div>
            )}

            <div className="relative flex items-center justify-between">
              <p className="text-xs text-gray-600">Podrás personalizar el prompt y la temperatura después</p>
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  setCreateError("");
                }}
                disabled={creatingAgent}
                className="px-5 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[.05] transition-colors font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
