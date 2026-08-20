"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Target, Loader2, ChevronLeft } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { CampaignBasicsForm } from "@/components/campaigns/CampaignBasicsForm";
import { CampaignWizardStepper } from "@/components/campaigns/CampaignWizardStepper";
import { CampaignStepSchedule } from "@/components/campaigns/steps/CampaignStepSchedule";
import { CampaignStepAudience } from "@/components/campaigns/steps/CampaignStepAudience";
import { CAMPAIGN_WIZARD_STEPS } from "@/types/voice-campaign";
import type {
  CampaignAudienceTableRecord,
  CampaignFieldMapping,
  CampaignScheduleConfig,
  CampaignTriggerRule,
  VoiceCampaignRecord,
} from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import type { VoiceAgentListItem } from "@/types/voice-agent";
import {
  defaultFieldMapping,
  defaultScheduleConfig,
  defaultTriggerRule,
} from "@/lib/campaigns/record";

interface CampaignWizardModalProps {
  open: boolean;
  campaignId?: string | null;
  onClose: () => void;
  onComplete: (campaignId: string) => void;
}

export function CampaignWizardModal({
  open,
  campaignId: initialCampaignId,
  onClose,
  onComplete,
}: CampaignWizardModalProps) {
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initKeyRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [voiceAgentId, setVoiceAgentId] = useState("");
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const [schedule, setSchedule] = useState<CampaignScheduleConfig>(defaultScheduleConfig());
  const [trigger, setTrigger] = useState<CampaignTriggerRule>(defaultTriggerRule());
  const [fieldMapping, setFieldMapping] = useState<CampaignFieldMapping>(defaultFieldMapping());
  const [audienceTableId, setAudienceTableId] = useState<string | null>(null);
  const [audienceTables, setAudienceTables] = useState<CampaignAudienceTableRecord[]>([]);
  const [audienceColumns, setAudienceColumns] = useState<DataTableColumn[]>([]);

  const stepMeta = CAMPAIGN_WIZARD_STEPS.find(s => s.id === step);

  const hydrateFromCampaign = useCallback((c: VoiceCampaignRecord, jumpToStep?: number) => {
    setCampaignId(c.id);
    setName(c.name);
    setGoal(c.goal ?? "");
    setVoiceAgentId(c.voice_agent_id ?? "");
    setSchedule(c.schedule_config);
    setTrigger(c.trigger_rule);
    setFieldMapping(c.field_mapping);
    setAudienceTableId(c.audience_table_id);
    if (jumpToStep !== undefined) {
      setStep(Math.max(1, Math.min(3, jumpToStep)));
    }
  }, []);

  const resetForNew = useCallback(() => {
    setStep(1);
    setCampaignId(null);
    setName("");
    setGoal("");
    setVoiceAgentId("");
    setSchedule(defaultScheduleConfig());
    setTrigger(defaultTriggerRule());
    setFieldMapping(defaultFieldMapping());
    setAudienceTableId(null);
    setAudienceColumns([]);
    setError("");
  }, []);

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true);
    const res = await authFetch("/api/voice/agents");
    const json = await res.json();
    if (res.ok) setAgents(json.agents ?? []);
    setLoadingAgents(false);
  }, []);

  const loadAudienceTables = useCallback(async () => {
    const res = await authFetch("/api/campaigns/audience-tables");
    const json = await res.json();
    if (res.ok) setAudienceTables(json.tables ?? []);
  }, []);

  const loadCampaign = useCallback(
    async (id: string) => {
      setLoading(true);
      const res = await authFetch(`/api/campaigns/${id}`);
      const json = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar la campaña");
        return;
      }
      const c = json.campaign as VoiceCampaignRecord;
      hydrateFromCampaign(c, Math.max(1, Math.min(3, c.wizard_step || 1)));
    },
    [hydrateFromCampaign]
  );

  useEffect(() => {
    if (!open) {
      initKeyRef.current = null;
      return;
    }

    const initKey = initialCampaignId ?? "__new__";
    if (initKeyRef.current === initKey) return;
    initKeyRef.current = initKey;

    void loadAgents();
    void loadAudienceTables();

    if (initialCampaignId) {
      void loadCampaign(initialCampaignId);
    } else {
      resetForNew();
    }
  }, [open, initialCampaignId, loadAgents, loadAudienceTables, loadCampaign, resetForNew]);

  useEffect(() => {
    if (!audienceTableId) return;
    const table = audienceTables.find(t => t.id === audienceTableId);
    if (table?.columns?.length) setAudienceColumns(table.columns);
  }, [audienceTableId, audienceTables]);

  const handleClose = () => {
    initKeyRef.current = null;
    resetForNew();
    onClose();
  };

  const saveStep1 = async () => {
    if (!name.trim() || !voiceAgentId) {
      setError("Nombre y agente son obligatorios");
      return;
    }
    setSaving(true);
    setError("");

    if (campaignId) {
      const res = await authFetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal: goal.trim(),
          voice_agent_id: voiceAgentId,
          wizard_step: 2,
        }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(json.error ?? "Error al guardar");
        return;
      }
      setCampaignId(json.campaign.id);
      setStep(2);
      return;
    }

    const res = await authFetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        goal: goal.trim(),
        voice_agent_id: voiceAgentId,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al crear la campaña");
      return;
    }
    setCampaignId(json.campaign.id);
    setStep(2);
  };

  const saveStep2 = async () => {
    if (!campaignId) return;
    setSaving(true);
    setError("");
    const res = await authFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_config: schedule,
        trigger_rule: trigger,
        wizard_step: 3,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    setStep(3);
  };

  const onAudienceLinked = (
    tableId: string,
    mapping?: CampaignFieldMapping,
    columns?: DataTableColumn[]
  ) => {
    setAudienceTableId(tableId);
    if (columns?.length) setAudienceColumns(columns);
    if (mapping) setFieldMapping(mapping);
    void loadAudienceTables();
  };

  const saveCampaign = async () => {
    if (!campaignId) return;
    if (!audienceTableId) {
      setError("Importa o selecciona una audiencia");
      return;
    }
    setSaving(true);
    setError("");

    const res = await authFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_mapping: fieldMapping,
        wizard_step: 3,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    initKeyRef.current = null;
    resetForNew();
    onComplete(campaignId);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="relative bg-noova-surface border border-white/[.10] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="relative px-6 pt-5 pb-0 shrink-0 border-b border-white/[.06]">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06] z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 pr-10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 text-[#99c9ff]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                {name.trim() || "Nueva campaña de voz"}
              </h2>
              <p className="text-[11px] text-gray-500">
                Paso {step} · {stepMeta?.label ?? ""}
              </p>
            </div>
          </div>

          <CampaignWizardStepper currentStep={step} />
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando campaña…
            </div>
          ) : step === 1 ? (
            loadingAgents ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando agentes…
              </div>
            ) : agents.length === 0 ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Crea un agente de voz antes de lanzar una campaña.
              </div>
            ) : (
              <CampaignBasicsForm
                name={name}
                goal={goal}
                voiceAgentId={voiceAgentId}
                agents={agents}
                onChange={patch => {
                  if (patch.name !== undefined) setName(patch.name);
                  if (patch.goal !== undefined) setGoal(patch.goal);
                  if (patch.voice_agent_id !== undefined) setVoiceAgentId(patch.voice_agent_id);
                }}
              />
            )
          ) : step === 2 ? (
            <CampaignStepSchedule
              schedule={schedule}
              trigger={trigger}
              onScheduleChange={setSchedule}
              onTriggerChange={setTrigger}
              embedded
            />
          ) : (
            campaignId && (
              <CampaignStepAudience
                campaignId={campaignId}
                audienceTableId={audienceTableId}
                existingTables={audienceTables}
                columns={audienceColumns}
                fieldMapping={fieldMapping}
                triggerNeedsDate={trigger.type === "excel_date"}
                onColumnsChange={setAudienceColumns}
                onMappingChange={setFieldMapping}
                onLinked={onAudienceLinked}
                embedded
              />
            )
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-white/[.06] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep(step - 1) : handleClose())}
            className={`${btnGhost} gap-2 text-sm`}
          >
            <ChevronLeft className="w-4 h-4" />
            {step > 1 ? "Atrás" : "Cancelar"}
          </button>

          <div className="flex items-center gap-2">
            {step === 1 && (
              <button
                type="button"
                onClick={() => void saveStep1()}
                disabled={saving || loadingAgents || agents.length === 0}
                className={`${btnPrimary} text-sm disabled:opacity-50`}
              >
                {saving ? "Guardando…" : "Continuar"}
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => void saveStep2()}
                disabled={saving}
                className={`${btnPrimary} text-sm disabled:opacity-50`}
              >
                {saving ? "Guardando…" : "Continuar"}
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={() => void saveCampaign()}
                disabled={saving || !audienceTableId}
                className={`${btnPrimary} text-sm disabled:opacity-50`}
              >
                {saving ? "Guardando…" : "Guardar campaña"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
