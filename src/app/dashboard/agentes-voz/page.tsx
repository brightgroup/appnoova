"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, MoreVertical, ChevronLeft, Mic, MicOff, PhoneCall, ShieldCheck, TrendingUp, ArrowRight, Sparkles, AlertTriangle, CheckCircle2, Loader2, Trash2, RefreshCw, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnIcon, btnIconSm, registryPage, registryContent, registryRowIcon,
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
  formatContactedLine,
  formatCostPerResult,
  formatCostUsd,
  qualityBadgeClass
} from "@/lib/voice-agent-display";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import type { VoiceAgentListItem } from "@/types/voice-agent";

const AGENT_TEMPLATES = [
  {
    id: "lead-qualification",
    name: "Calificación de Leads",
    tag: "Inbound",
    icon: PhoneCall,
    iconBg: "from-[#1d4ed8] to-[#38bdf8]",
    ringColor: "hover:ring-[#38bdf8]/50",
    stat: "+40% conversión",
    statColor: "text-[#38bdf8]",
    desc: "Llama a prospectos, califica su intención de compra y obtén información clave automáticamente."
  },
  {
    id: "policy-reminder",
    name: "Recordatorio de Póliza",
    tag: "Outbound",
    icon: ShieldCheck,
    iconBg: "from-[#0369a1] to-[#00eaff]",
    ringColor: "hover:ring-[#00eaff]/50",
    stat: "+65% renovaciones",
    statColor: "text-[#00eaff]",
    desc: "Contacta clientes antes del vencimiento y agenda renovaciones de pólizas sin esfuerzo."
  },
  {
    id: "follow-up",
    name: "Follow-up Inteligente",
    tag: "Outbound",
    icon: TrendingUp,
    iconBg: "from-[#1e40af] to-[#67e8f9]",
    ringColor: "hover:ring-[#67e8f9]/50",
    stat: "+30% cierre",
    statColor: "text-[#67e8f9]",
    desc: "Da seguimiento automático a oportunidades abiertas y reactiva leads sin respuesta."
  }
];

type MicState = "idle" | "requesting" | "active" | "denied" | "error";

export default function AgentesVozPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [listError, setListError] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showMicrophoneModal, setShowMicrophoneModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [menuAgentId, setMenuAgentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VoiceAgentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Mic state
  const [micState, setMicState] = useState<MicState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const streamRef    = useRef<MediaStream | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

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

  useEffect(() => {
    if (!menuAgentId) return;
    const close = () => setMenuAgentId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuAgentId]);

  // Limpia el stream y la animación al cerrar el modal
  const stopMic = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
    setMicState("idle");
  }, []);

  // Visualización de nivel de audio
  const startLevelMonitor = (stream: MediaStream) => {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(avg / 80, 1)); // normaliza 0-1
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleActivateMicrophone = async () => {
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      startLevelMonitor(stream);
      setMicState("active");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicState("denied");
      } else {
        setMicState("error");
      }
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setCreateError("");
    setShowTemplateModal(false);
    setShowMicrophoneModal(true);
    setMicState("idle");
  };

  const handleCloseMicModal = () => {
    stopMic();
    setShowMicrophoneModal(false);
    setSelectedTemplate(null);
  };

  const handleContinue = async () => {
    const template = selectedTemplate ?? "lead-qualification";
    stopMic();
    setCreatingAgent(true);
    setCreateError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/voice/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({ source_template: template })
      });
      const data = await res.json();
      if (!res.ok || !data.agent?.id) {
        const msg = data.error || "No se pudo crear el agente";
        setCreateError(msg);
        setListError(msg);
        return;
      }
      setShowMicrophoneModal(false);
      setSelectedTemplate(null);
      setAgents(prev => {
        const item = data.agent;
        if (!item?.id) return prev;
        const exists = prev.some(a => a.id === item.id);
        if (exists) return prev;
        return [{
          id: item.id,
          source_template: item.source_template ?? template,
          name: item.name,
          contacts_count: item.contacts_count ?? 0,
          contacted_count: item.contacted_count ?? 0,
          calls_count: item.calls_count ?? 0,
          goals_achieved: item.goals_achieved ?? 0,
          cost_usd: item.cost_usd ?? 0,
          quality_label: item.quality_label ?? "Aprendiendo",
          updated_at: item.updated_at ?? new Date().toISOString()
        }, ...prev];
      });
      router.push(`/dashboard/agentes-voz/configuracion?id=${data.agent.id}&tab=probar`);
    } catch {
      const msg = "Error de red al crear el agente";
      setCreateError(msg);
      setListError(msg);
    } finally {
      setCreatingAgent(false);
    }
  };

  // Limpieza al desmontar
  useEffect(() => () => stopMic(), [stopMic]);

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
              Agentes IA para llamadas de cobro, confirmación y calificación
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

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="relative bg-noova-surface border border-white/[.10] rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl overflow-hidden">

            {/* Ambient glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#5b5bf6]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5b5bf6]/10 border border-[#5b5bf6]/20">
                  <Sparkles className="w-3 h-3 text-[#5b5bf6]" />
                  <span className="text-xs font-medium text-[#5b5bf6]">IA de Voz</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Elige tu plantilla</h2>
              <p className="text-sm text-gray-500 mt-1">Selecciona el tipo de agente que necesitas</p>
            </div>

            {/* Templates Grid */}
            <div className="relative grid grid-cols-3 gap-4 mb-8">
              {AGENT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`group relative flex flex-col p-5 rounded-2xl bg-white/[.03] border border-white/[.08] hover:border-white/[.16] hover:bg-white/[.05] hover:ring-2 ${template.ringColor} hover:ring-offset-0 transition-all duration-200 cursor-pointer text-left`}
                  >
                    {/* Tag */}
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-4">{template.tag}</span>

                    {/* Icon */}
                    <div className={`mb-4 w-11 h-11 rounded-xl bg-gradient-to-br ${template.iconBg} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-white text-sm leading-snug mb-2">{template.name}</h3>

                    {/* Description */}
                    <p className="text-xs text-gray-500 leading-relaxed flex-1">{template.desc}</p>

                    {/* Stat */}
                    <div className={`mt-4 text-xs font-semibold ${template.statColor}`}>
                      {template.stat}
                    </div>

                    {/* Arrow on hover */}
                    <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="relative flex items-center justify-between">
              <p className="text-xs text-gray-600">Podrás personalizar el agente después</p>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[.05] transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Activation Modal */}
      {showMicrophoneModal && selectedTemplate && (() => {
        const tpl = AGENT_TEMPLATES.find(t => t.id === selectedTemplate)!;
        const TplIcon = tpl.icon;
        const pulse = 1 + audioLevel * 0.5; // escala el ring según el nivel de audio

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
            <div className="relative bg-noova-surface border border-white/[.10] rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl overflow-hidden">

              {/* Ambient glow que pulsa con el audio */}
              <div
                className="absolute inset-0 pointer-events-none transition-all duration-75"
                style={{
                  background: micState === "active"
                    ? `radial-gradient(ellipse 60% 40% at 50% 50%, rgba(91,91,246,${0.06 + audioLevel * 0.12}) 0%, transparent 70%)`
                    : "none"
                }}
              />

              {/* Header */}
              <div className="relative mb-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tpl.iconBg} flex items-center justify-center`}>
                    <TplIcon className="w-4 h-4 text-white" strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-semibold text-white">{tpl.name}</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {micState === "active" ? "Micrófono activo" : "Activa tu micrófono"}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {micState === "idle"       && "El agente necesita escucharte para conversar"}
                  {micState === "requesting" && "Esperando permiso del navegador..."}
                  {micState === "active"     && "Te estamos escuchando — habla con tu agente"}
                  {micState === "denied"     && "Permiso denegado — revisa la configuración del navegador"}
                  {micState === "error"      && "No se pudo acceder al micrófono"}
                </p>
              </div>

              {/* Mic visualizer */}
              <div className="relative flex justify-center items-center mb-8" style={{ height: 160 }}>

                {/* Rings de audio — solo visibles cuando está activo */}
                {micState === "active" && (
                  <>
                    <div
                      className="absolute rounded-full border border-[#5b5bf6]/20 transition-all duration-75"
                      style={{
                        width:  `${120 + audioLevel * 60}px`,
                        height: `${120 + audioLevel * 60}px`,
                        opacity: 0.4 + audioLevel * 0.4
                      }}
                    />
                    <div
                      className="absolute rounded-full border border-[#5b5bf6]/10 transition-all duration-100"
                      style={{
                        width:  `${140 + audioLevel * 80}px`,
                        height: `${140 + audioLevel * 80}px`,
                        opacity: 0.2 + audioLevel * 0.3
                      }}
                    />
                  </>
                )}

                {/* Círculo principal */}
                <div
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-150 ${
                    micState === "active"
                      ? "bg-[#5b5bf6] shadow-lg shadow-[#5b5bf6]/40"
                      : micState === "denied" || micState === "error"
                      ? "bg-red-500/10 border-2 border-red-500/30"
                      : "bg-white/[.04] border-2 border-white/[.10]"
                  }`}
                  style={micState === "active" ? { transform: `scale(${pulse})` } : {}}
                >
                  {micState === "idle"       && <MicOff  className="w-10 h-10 text-gray-500" />}
                  {micState === "requesting" && <Mic     className="w-10 h-10 text-[#5b5bf6] animate-pulse" />}
                  {micState === "active"     && <Mic     className="w-10 h-10 text-white" />}
                  {micState === "denied"     && <AlertTriangle className="w-10 h-10 text-red-400" />}
                  {micState === "error"      && <AlertTriangle className="w-10 h-10 text-red-400" />}
                </div>
              </div>

              {/* Barra de nivel de audio */}
              {micState === "active" && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Nivel de audio</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">En vivo</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/[.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5b5bf6] rounded-full transition-all duration-75"
                      style={{ width: `${Math.max(audioLevel * 100, 2)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error / denied instructions */}
              {(micState === "denied" || micState === "error") && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/[.07] border border-red-500/20 text-sm text-red-400">
                  {micState === "denied"
                    ? "Haz clic en el ícono 🔒 en la barra del navegador y permite el acceso al micrófono. Luego recarga la página."
                    : "No se detectó ningún micrófono. Verifica que esté conectado y vuelve a intentarlo."}
                </div>
              )}

              {createError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 leading-relaxed">
                  {createError}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseMicModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[.08] text-sm text-gray-400 hover:text-white hover:bg-white/[.05] transition-colors font-medium"
                >
                  Cancelar
                </button>

                {micState === "active" ? (
                  <button
                    onClick={handleContinue}
                    disabled={creatingAgent}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-semibold transition-all shadow-lg shadow-[#5b5bf6]/25 disabled:opacity-60"
                  >
                    {creatingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    {creatingAgent ? "Creando agente..." : "Continuar"}
                  </button>
                ) : (
                  <button
                    onClick={handleActivateMicrophone}
                    disabled={micState === "requesting"}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#5b5bf6]/25"
                  >
                    <Mic className="w-4 h-4" />
                    {micState === "requesting" ? "Esperando..." : micState === "denied" || micState === "error" ? "Reintentar" : "Activar micrófono"}
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
