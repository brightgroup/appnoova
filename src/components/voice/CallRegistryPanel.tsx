"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeft, Download, Loader2, Play, Pause, Phone,
  RefreshCw, Search, FileJson, SlidersHorizontal, ArrowUpDown
} from "lucide-react";
import {
  btnFilterActive, btnFilterGroup, btnFilterIdle, btnGhost, btnIcon, btnIconSm, btnMenuIcon,
  registryContent, registryTable, registryTableHead, registryTableHeadRow,
  registryTableHeadCell, registryTableRowClickable, registryTableCell, registryTableCellFirst,
  registryTableLoading, registryTableEmpty,
  tabActive, tabIdle, textMuted, textSecondary
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  audioExtensionFromUrl, callQualityPercent, displayCallId, downloadCallJson, downloadCallAudio,
  formatCallDateShort, formatCallDuration, formatCallTimestamp, formatTranscriptTime
} from "@/lib/voice-call-utils";
import type { VoiceAgentCallListItem, VoiceAgentCallRecord } from "@/types/voice-agent-call";

type CallFilter = "todas" | "exitosas" | "conectadas";

function callMeta(call: VoiceAgentCallListItem): Record<string, unknown> {
  return call.metadata ?? {};
}

function callChannel(meta: Record<string, unknown>): "phone_test" | "campaign" | "crm" | "web_test" {
  if (meta.campaign_outbound) return "campaign";
  if (meta.crm_outbound) return "crm";
  if (meta.phone_test || meta.source === "phone_test") return "phone_test";
  return "web_test";
}

function isOutboundCall(call: VoiceAgentCallListItem): boolean {
  return callChannel(callMeta(call)) !== "web_test";
}

function callOriginNumber(call: VoiceAgentCallListItem): string {
  const meta = callMeta(call);
  if (isOutboundCall(call)) return String(meta.from ?? "—");
  return "Prueba web";
}

function callDestNumber(call: VoiceAgentCallListItem): string {
  const meta = callMeta(call);
  if (isOutboundCall(call)) return String(meta.to ?? call.phone_number);
  return call.phone_number;
}

function callDirection(call: VoiceAgentCallListItem): string {
  const ch = callChannel(callMeta(call));
  if (ch === "campaign") return "campaña";
  if (ch === "crm") return "crm";
  if (ch === "phone_test") return "prueba";
  return "web";
}

function callStatusDisplay(call: VoiceAgentCallListItem): string {
  if (call.in_voicemail || call.status === "voicemail") {
    const label = call.status_label?.trim();
    if (label?.toLowerCase().includes("buzón")) return label;
    const meta = callMeta(call);
    const kind = callChannel(meta);
    if (kind === "campaign") return "Campaña — Buzón de voz";
    if (kind === "crm") return "Llamada IA — Buzón de voz";
    if (kind === "phone_test") return "Prueba — Buzón de voz";
    return "Buzón de voz";
  }
  if (call.status_label?.trim()) return call.status_label;
  return call.status ?? "—";
}

function callDisconnectDisplay(call: VoiceAgentCallListItem): string {
  if (call.in_voicemail || callMeta(call).outcome === "voicemail") return "buzón de voz";
  const outcome = String(callMeta(call).outcome ?? "");
  if (outcome === "no_answer") return "no contestada";
  if (outcome === "busy") return "línea ocupada";
  if (outcome === "failed") return "error de conexión";
  const reason = call.disconnect_reason?.trim() ?? "";
  if (/buz[oó]n|voicemail|machine/i.test(reason)) return "buzón de voz";
  if (/no contest|no_answer|timeout|amd sin/i.test(reason)) return "no contestada";
  return reason.replace(/\s+/g, " ").toLowerCase() || "—";
}

interface CallRegistryPanelProps {
  /** Filtra por agente. Si se omite, muestra todas las llamadas del usuario. */
  agentId?: string;
  /** Filtra por campaña. */
  campaignId?: string;
  refreshKey?: number;
}

export function CallRegistryPanel({ agentId, campaignId, refreshKey = 0 }: CallRegistryPanelProps) {
  const [calls, setCalls] = useState<VoiceAgentCallListItem[]>([]);
  const [selected, setSelected] = useState<VoiceAgentCallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [detailTab, setDetailTab] = useState<"transcripcion" | "comentarios" | "calidad">("transcripcion");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CallFilter>("todas");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (agentId) params.set("agent_id", agentId);
      if (campaignId) params.set("campaign_id", campaignId);
      const res = await fetch(`/api/voice/agents/calls?${params.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        if (!opts?.silent) setError(data.error || "Error al cargar llamadas");
        return;
      }
      setDbReady(data.dbReady !== false);
      setCalls(data.calls ?? []);
    } catch {
      if (!opts?.silent) setError("Error de red");
    }
    if (!opts?.silent) setLoading(false);
  }, [agentId, campaignId]);

  useEffect(() => { void loadList(); }, [loadList, refreshKey]);

  useEffect(() => {
    if (!campaignId) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadList();
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [campaignId, loadList]);

  const filteredCalls = useMemo(() => {
    let list = calls;
    if (filter === "exitosas") {
      list = list.filter(c => c.status_label.toLowerCase().includes("exitosa"));
    } else if (filter === "conectadas") {
      list = list.filter(c => c.duration_sec >= 5);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.phone_number.toLowerCase().includes(q) ||
        c.disconnect_reason.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [calls, filter, search]);

  const pagination = useRegistryPagination(filteredCalls.length, `${filter}-${search}`);
  const pageRows = pagination.pageRows(filteredCalls);

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const togglePlay = (callId: string, url: string | null) => {
    if (!url) return;
    if (playingId === callId) { stopAudio(); return; }
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingId(null);
    }
    audioRef.current.src = url;
    audioRef.current.play().catch(() => setError("No se pudo reproducir el audio"));
    setPlayingId(callId);
  };

  const openCall = async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/voice/agents/calls?id=${id}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar detalle");
        return;
      }
      setSelected(data.call);
      setDetailTab("transcripcion");
    } catch {
      setError("Error de red");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selected) return;
    setReanalyzing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/voice/agents/calls/analyze?id=${selected.id}`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al analizar"); return; }
      setSelected(prev => prev ? {
        ...prev,
        summary: data.call.summary,
        user_sentiment: data.call.user_sentiment,
        extracted_data: data.call.extracted_data
      } : null);
      await loadList();
    } catch {
      setError("Error de red al analizar");
    }
    setReanalyzing(false);
  };

  const handleDownloadAudio = async (call: { id: string; audio_url: string | null }) => {
    if (!call.audio_url) return;
    const ext = audioExtensionFromUrl(call.audio_url);
    await downloadCallAudio(call.audio_url, `${displayCallId(call.id)}.${ext}`);
  };

  if (detailLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando llamada...
      </div>
    );
  }

  if (selected) {
    return (
      <CallDetailView
        selected={selected}
        detailLoading={false}
        detailTab={detailTab}
        setDetailTab={setDetailTab}
        reanalyzing={reanalyzing}
        onBack={() => { setSelected(null); stopAudio(); }}
        onReanalyze={handleReanalyze}
        onDownloadAudio={handleDownloadAudio}
        onDownloadJson={() => downloadCallJson(selected as unknown as Record<string, unknown>, `${displayCallId(selected.id)}.json`)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className={registryContent}>
        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar"
          onRefresh={() => void loadList()}
          refreshing={loading}
          error={error || undefined}
          alerts={!dbReady ? (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
              Ejecuta la migración <code>006_voice_agent_calls.sql</code> en Supabase.
            </div>
          ) : undefined}
          filters={
            <div className={`${btnFilterGroup} w-fit`}>
              {([
                ["conectadas", "Conectadas"],
                ["exitosas", "Exitosas"],
                ["todas", "Todas"]
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={filter === id ? btnFilterActive : btnFilterIdle}
                >
                  {label}
                </button>
              ))}
            </div>
          }
          action={
            <button className={btnIcon} title="Columnas">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          }
          footer={!loading && filteredCalls.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="llamadas"
            />
          ) : undefined}
        >
        {loading ? (
          <div className={registryTableLoading}>
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando llamadas...
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className={`${registryTableEmpty} px-6`}>
            <Phone className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
            <p>No hay llamadas en este filtro.</p>
          </div>
        ) : (
          <table className={`${registryTable} min-w-[1200px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <Th>Fecha <ArrowUpDown className="w-3 h-3 inline opacity-40" /></Th>
                <Th>Duración</Th>
                <Th>Créditos</Th>
                <Th>Calidad</Th>
                <Th>Núm. origen</Th>
                <Th>Núm. destino</Th>
                <Th>Contacto</Th>
                <Th>Estado</Th>
                <Th>Desconexión</Th>
                <Th>Exitosa</Th>
                <Th>Dirección</Th>
                <Th className="text-center">Grabación</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(call => {
                const quality = callQualityPercent(call);
                const isSuccess = call.status_label.toLowerCase().includes("exitosa");
                return (
                  <tr
                    key={call.id}
                    onClick={() => openCall(call.id)}
                    className={registryTableRowClickable}
                  >
                    <Td mono first>{formatCallDateShort(call.created_at)}</Td>
                    <Td mono>{formatCallDuration(call.duration_sec)}</Td>
                    <Td mono>{call.credits}</Td>
                    <Td>
                      <QualityBar percent={quality} />
                    </Td>
                    <Td mono className="text-gray-400">{callOriginNumber(call)}</Td>
                    <Td mono>{callDestNumber(call)}</Td>
                    <Td className="text-gray-400">N/A</Td>
                    <Td><span className="text-gray-200">{callStatusDisplay(call)}</span></Td>
                    <Td mono className="text-gray-400">{callDisconnectDisplay(call)}</Td>
                    <Td>{isSuccess ? <span className="text-gray-200">Sí</span> : <span className="text-gray-400">No</span>}</Td>
                    <Td className="text-gray-400">{callDirection(call)}</Td>
                    <Td>
                      <div className="flex items-center justify-center gap-1 flex-nowrap whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <IconBtn
                          title={call.audio_url ? "Reproducir" : "Sin grabación"}
                          disabled={!call.audio_url}
                          onClick={() => togglePlay(call.id, call.audio_url)}
                          active={playingId === call.id}
                        >
                          {playingId === call.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </IconBtn>
                        <IconBtn
                          title={call.audio_url ? "Descargar audio" : "Sin grabación"}
                          disabled={!call.audio_url}
                          onClick={() => handleDownloadAudio(call)}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Descargar JSON"
                          onClick={async () => {
                            const headers = await getAuthHeaders();
                            const res = await fetch(`/api/voice/agents/calls?id=${call.id}`, { headers });
                            const data = await res.json();
                            if (data.call) downloadCallJson(data.call, `${displayCallId(call.id)}.json`);
                          }}
                        >
                          <FileJson className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </RegistryTableLayout>
      </div>
    </div>
  );
}

function CallDetailView({
  selected, detailLoading, detailTab, setDetailTab, reanalyzing,
  onBack, onReanalyze, onDownloadAudio, onDownloadJson
}: {
  selected: VoiceAgentCallRecord;
  detailLoading: boolean;
  detailTab: "transcripcion" | "comentarios" | "calidad";
  setDetailTab: (t: "transcripcion" | "comentarios" | "calidad") => void;
  reanalyzing: boolean;
  onBack: () => void;
  onReanalyze: () => void;
  onDownloadAudio: (call: { id: string; audio_url: string | null }) => void;
  onDownloadJson: () => void;
}) {
  const quality = callQualityPercent(selected);

  if (detailLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando llamada...
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-noova-main text-white">
      <aside className="w-[40%] min-w-0 shrink-0 border-r border-white/[.10] overflow-y-auto p-5 space-y-5 bg-noova-surface">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className={btnMenuIcon}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold truncate">{selected.phone_number}</h2>
          <button onClick={onDownloadJson} className={`ml-auto ${btnGhost}`}>
            <FileJson className="w-3.5 h-3.5" /> JSON
          </button>
        </div>

        <MetaSection title="Análisis de conversación">
          <MetaRow label="ID de Llamada" value={displayCallId(selected.id)} mono fullText />
          <MetaRow label="Teléfono" value={selected.phone_number} />
          <MetaRow label="Duración" value={formatCallDuration(selected.duration_sec)} />
          <MetaRow label="Fecha" value={formatCallTimestamp(selected.created_at)} />
          <MetaRow label="Créditos" value={String(selected.credits)} />
          <MetaRow label="Calidad" value={`${quality}%`} />
          <MetaRow label="Estado" value={callStatusDisplay(selected)} />
          <MetaRow label="Desconexión" value={callDisconnectDisplay(selected)} />
          <MetaRow label="Sentimiento" value={selected.user_sentiment} />
        </MetaSection>

        <MetaSection title="Grabación">
          {selected.audio_url ? (
            <div className="flex items-center gap-2.5 min-h-[36px]">
              <audio
                controls
                src={selected.audio_url}
                className="flex-1 min-w-0 h-8"
                preload="metadata"
              />
              <button
                type="button"
                onClick={() => onDownloadAudio(selected)}
                className={`${btnGhost} shrink-0 whitespace-nowrap`}
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin grabación — haz una nueva prueba de llamada para generar audio.</p>
          )}
        </MetaSection>

        <MetaSection
          title="Resumen y análisis"
          action={
            <button onClick={onReanalyze} disabled={reanalyzing} className={`${btnIconSm} disabled:opacity-50`}>
              <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
            </button>
          }
        >
          <p className="text-sm text-gray-200 leading-relaxed">{selected.summary || "N/A"}</p>
        </MetaSection>

        <MetaSection title="Datos extraídos">
          {Object.keys(selected.extracted_data).length ? (
            Object.entries(selected.extracted_data).map(([k, v]) => (
              <div key={k} className="py-2 border-b border-white/[.04] last:border-0">
                <span className="text-xs font-semibold text-gray-100 block">
                  {k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{Array.isArray(v) ? v.join(" · ") : String(v ?? "")}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400">N/A</p>
          )}
        </MetaSection>
      </aside>

      <main className="w-[60%] min-w-0 flex flex-col bg-noova-surface">
        <div className="border-b border-white/[.06] px-5 flex gap-6 shrink-0">
          {(["transcripcion", "comentarios", "calidad"] as const).map(id => (
            <button
              key={id}
              onClick={() => setDetailTab(id)}
              className={`py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                detailTab === id ? tabActive : tabIdle
              }`}
            >
              {id === "transcripcion" ? "Transcripción" : id === "comentarios" ? "Comentarios" : "Calidad"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {detailTab === "transcripcion" && (
            <div className="space-y-3">
              {selected.transcript.map((line, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-gray-400 tabular-nums w-10 shrink-0">{formatTranscriptTime(line.time_sec)}</span>
                  <p>
                    <span className="font-semibold text-gray-100">{line.role === "user" ? "User" : "Agent"}: </span>
                    <span className="text-gray-200">{line.text}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
          {detailTab === "comentarios" && <p className="text-sm text-gray-400">Próximamente.</p>}
          {detailTab === "calidad" && <p className="text-sm text-gray-300">Calidad estimada: {quality}%</p>}
        </div>
      </main>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`${registryTableHeadCell} ${className}`}>{children}</th>;
}

function Td({ children, className = "", mono, first }: { children: React.ReactNode; className?: string; mono?: boolean; first?: boolean }) {
  const base = first ? registryTableCellFirst : registryTableCell;
  return (
    <td className={`${base} text-gray-100 whitespace-nowrap ${mono ? "tabular-nums font-mono text-[11px] text-gray-200" : ""} ${className}`}>
      {children}
    </td>
  );
}

function IconBtn({ children, onClick, title, disabled, active }: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${btnIconSm}${active ? " text-white bg-white/[.08]" : ""}`}
    >
      {children}
    </button>
  );
}

function QualityBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? "bg-emerald-500" : percent >= 60 ? "bg-[var(--nv-hubspot-teal)]" : "bg-[var(--nv-accent)]";
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/[.08] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-400 w-8">{percent}%</span>
    </div>
  );
}

function MetaSection({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
  fullText
}: {
  label: string;
  value: string;
  mono?: boolean;
  fullText?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[118px_1fr] gap-3 text-xs border-b border-white/[.05] last:border-0 ${
        fullText ? "py-2.5 items-start" : "min-h-[40px] items-center"
      }`}
    >
      <span className="text-gray-400 shrink-0 leading-none">{label}</span>
      <span
        className={`text-gray-100 min-w-0 ${
          fullText
            ? "font-mono text-[10px] break-all select-all leading-relaxed"
            : `truncate leading-none ${mono ? "font-mono text-[10px] tracking-tight" : ""}`
        }`}
        title={fullText ? undefined : value}
      >
        {value}
      </span>
    </div>
  );
}
