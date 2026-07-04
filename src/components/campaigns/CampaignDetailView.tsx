"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Settings2,
  FileText,
  Users,
  CalendarClock,
  Plug,
  History,
  LayoutGrid,
  Loader2,
  Save,
  CheckCircle2,
  Pause,
  Play,
  Rocket,
  ChevronLeft,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/record";
import { describeCampaignScheduleNow } from "@/lib/call-engine/campaign-schedule";
import { formatDatetimeCol } from "@/lib/format-datetime";
import { useMounted } from "@/hooks/useMounted";
import { CampaignGeneralPanel } from "@/components/campaigns/panels/CampaignGeneralPanel";
import { CampaignScriptPanel } from "@/components/campaigns/panels/CampaignScriptPanel";
import { CampaignAudiencePanel } from "@/components/campaigns/panels/CampaignAudiencePanel";
import { CampaignSchedulePanel } from "@/components/campaigns/panels/CampaignSchedulePanel";
import { CampaignConnectionsPanel } from "@/components/campaigns/panels/CampaignConnectionsPanel";
import { CampaignMetricsPanel } from "@/components/campaigns/panels/CampaignMetricsPanel";
import { CallRegistryPanel } from "@/components/voice/CallRegistryPanel";
import {
  CAMPAIGN_CONFIG_TABS,
  type CampaignDetailTab,
  type VoiceCampaignRecord,
} from "@/types/voice-campaign";

const TABS: { id: CampaignDetailTab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "guion", label: "Agente y guion", icon: FileText },
  { id: "audiencia", label: "Audiencia", icon: Users },
  { id: "programacion", label: "Programación", icon: CalendarClock },
  { id: "conexiones", label: "Conexiones", icon: Plug },
  { id: "registro", label: "Registro de llamadas", icon: History },
  { id: "metricas", label: "Métricas", icon: LayoutGrid },
];

interface CampaignDetailViewProps {
  campaignId: string;
  initialTab?: CampaignDetailTab;
}

export function CampaignDetailView({ campaignId, initialTab = "general" }: CampaignDetailViewProps) {
  const router = useRouter();
  const mounted = useMounted();
  const [activeTab, setActiveTab] = useState<CampaignDetailTab>(initialTab);
  const [campaign, setCampaign] = useState<VoiceCampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [activating, setActivating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [error, setError] = useState("");

  const setTab = useCallback(
    (tab: CampaignDetailTab) => {
      setActiveTab(tab);
      router.replace(`/dashboard/campaigns/${campaignId}?tab=${tab}`, { scroll: false });
    },
    [router, campaignId]
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/campaigns/${campaignId}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo cargar la campaña");
      return;
    }
    setCampaign(json.campaign);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign || campaign.status !== "active") return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [campaign?.status, load]);

  const handleSave = async () => {
    if (!campaign) return;
    setSaving(true);
    setError("");
    const res = await authFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaign.name,
        goal: campaign.goal,
        voice_agent_id: campaign.voice_agent_id,
        schedule_config: campaign.schedule_config,
        trigger_rule: campaign.trigger_rule,
        field_mapping: campaign.field_mapping,
        prompt_template: campaign.prompt_template,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    setCampaign(json.campaign);
    setSaved(true);
  };

  const toggleStatus = async () => {
    if (!campaign) return;
    const next = campaign.status === "active" ? "paused" : "active";
    const res = await authFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (res.ok) setCampaign(json.campaign);
  };

  const resetAudience = async () => {
    if (!campaign) return;
    if (campaign.status === "active") {
      setError("Pausa la campaña antes de reiniciar los contactos.");
      return;
    }
    const isNewRound = campaign.status === "completed";
    if (
      !window.confirm(
        isNewRound
          ? "¿Iniciar una nueva ronda? Todos los contactos volverán a pendiente. El historial de llamadas se conserva."
          : "¿Reiniciar todos los contactos a pendiente? El historial de llamadas se conserva."
      )
    ) {
      return;
    }
    setResetting(true);
    setError("");
    setResetMsg("");
    const res = await authFetch(`/api/campaigns/${campaignId}/reset-audience`, { method: "POST" });
    const json = await res.json();
    setResetting(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo reiniciar");
      return;
    }
    if (json.campaign) setCampaign(json.campaign);
    setResetMsg(json.message ?? "Contactos reiniciados.");
  };

  const activateDraft = async () => {
    if (!campaign) return;
    setActivating(true);
    setError("");
    // Guarda cambios pendientes primero para no perder mapeo/prompt.
    if (!saved) await handleSave();
    const res = await authFetch(`/api/campaigns/${campaignId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_mapping: campaign.field_mapping, activate: true }),
    });
    const json = await res.json();
    setActivating(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo activar la campaña");
      return;
    }
    setCampaign(json.campaign);
    setSaved(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando campaña…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        Campaña no encontrada
      </div>
    );
  }

  const statusLabel = CAMPAIGN_STATUS_LABELS[campaign.status];
  const scheduleLive = mounted ? describeCampaignScheduleNow(campaign.schedule_config) : null;
  const isConfigTab = CAMPAIGN_CONFIG_TABS.includes(activeTab);

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/campaigns"
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{campaign.name}</h1>
            <p className="text-xs text-gray-400">
              {statusLabel}
              {campaign.goal ? ` · ${campaign.goal.slice(0, 80)}${campaign.goal.length > 80 ? "…" : ""}` : ""}
              {!saved && " · Sin guardar"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {campaign.status === "draft" && (
            <button
              type="button"
              onClick={() => void activateDraft()}
              disabled={activating}
              className={`${btnPrimary} gap-2`}
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {activating ? "Activando…" : "Activar campaña"}
            </button>
          )}
          {(campaign.status === "active" || campaign.status === "paused") && (
            <>
              {campaign.status === "paused" && (
                <button
                  type="button"
                  onClick={() => void resetAudience()}
                  disabled={resetting}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white hover:bg-white/[.08] disabled:opacity-50"
                  title="Vuelve todos los contactos a pendiente para una nueva ronda"
                >
                  {resetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Reiniciar contactos
                </button>
              )}
              <button type="button" onClick={() => void toggleStatus()} className={btnPrimary}>
              {campaign.status === "active" ? (
                <>
                  <Pause className="w-4 h-4" /> Pausar
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Reanudar
                </>
              )}
            </button>
            </>
          )}
          {campaign.status === "completed" && (
            <button
              type="button"
              onClick={() => void resetAudience()}
              disabled={resetting}
              className={`${btnPrimary} gap-2`}
              title="Reinicia la audiencia y deja la campaña pausada para una nueva ronda"
            >
              {resetting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {resetting ? "Preparando…" : "Nueva ronda"}
            </button>
          )}
          {isConfigTab && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || saved}
              className={`${btnPrimary} gap-2`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive ? tabActive : tabIdle
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {campaign.status === "completed" && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-[#5b5bf6]/10 border border-[#5b5bf6]/25 text-xs text-[#c8c8ff] shrink-0">
          <strong className="font-medium">Campaña finalizada.</strong>{" "}
          Todos los contactos fueron procesados
          {campaign.completed_at ? ` el ${formatDatetimeCol(campaign.completed_at)}` : ""}
          . Usa <strong className="font-medium">Nueva ronda</strong> para volver a marcar la misma audiencia; el historial de llamadas se conserva.
        </div>
      )}
      {mounted && campaign.status === "active" && scheduleLive && !scheduleLive.in_schedule && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 shrink-0">
          <strong className="font-medium">Marcador en pausa — fuera de horario.</strong>{" "}
          {scheduleLive.message} Hora local: {scheduleLive.local_time} · ventana {scheduleLive.window}.
          Ve a <button type="button" onClick={() => setTab("programacion")} className="underline hover:text-white">Programación</button> para ampliar el horario.
        </div>
      )}
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}
      {resetMsg && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 shrink-0">
          {resetMsg}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === "general" && (
          <CampaignGeneralPanel campaign={campaign} onChange={onPatch(setCampaign, setSaved)} />
        )}
        {activeTab === "guion" && (
          <CampaignScriptPanel campaign={campaign} onChange={onPatch(setCampaign, setSaved)} />
        )}
        {activeTab === "audiencia" && (
          <CampaignAudiencePanel campaign={campaign} onChange={onPatch(setCampaign, setSaved)} />
        )}
        {activeTab === "programacion" && (
          <CampaignSchedulePanel campaign={campaign} onChange={onPatch(setCampaign, setSaved)} />
        )}
        {activeTab === "conexiones" && <CampaignConnectionsPanel />}
        {activeTab === "registro" && <CallRegistryPanel campaignId={campaignId} />}
        {activeTab === "metricas" && <CampaignMetricsPanel campaignId={campaignId} />}
      </div>
    </div>
  );
}

function onPatch(
  setCampaign: React.Dispatch<React.SetStateAction<VoiceCampaignRecord | null>>,
  setSaved: React.Dispatch<React.SetStateAction<boolean>>
) {
  return (patch: Partial<VoiceCampaignRecord>) => {
    setCampaign(prev => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };
}
