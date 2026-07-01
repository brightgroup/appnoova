"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, X } from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import { btnGhost } from "@/lib/brand-ui";
import { CampaignWizardStepper } from "@/components/campaigns/CampaignWizardStepper";
import { CampaignContinueButton } from "@/components/campaigns/CampaignWizardPanel";
import { CampaignStepBasics } from "@/components/campaigns/steps/CampaignStepBasics";
import { CampaignStepSchedule } from "@/components/campaigns/steps/CampaignStepSchedule";
import { CampaignStepAudience } from "@/components/campaigns/steps/CampaignStepAudience";
import { CampaignStepMapping } from "@/components/campaigns/steps/CampaignStepMapping";
import type {
  CampaignAudienceTableRecord,
  CampaignFieldMapping,
  CampaignScheduleConfig,
  CampaignTriggerRule,
  VoiceCampaignRecord,
} from "@/types/voice-campaign";
import type { VoiceAgentListItem } from "@/types/voice-agent";
import type { DataTableColumn } from "@/types/data-table";
import {
  defaultFieldMapping,
  defaultScheduleConfig,
  defaultTriggerRule,
} from "@/lib/campaigns/record";

interface CampaignWizardProps {
  campaignId?: string | null;
  initialStep?: number;
}

export function CampaignWizard({ campaignId: initialCampaignId, initialStep = 1 }: CampaignWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [loading, setLoading] = useState(Boolean(initialCampaignId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [voiceAgentId, setVoiceAgentId] = useState("");
  const [schedule, setSchedule] = useState<CampaignScheduleConfig>(defaultScheduleConfig());
  const [trigger, setTrigger] = useState<CampaignTriggerRule>(defaultTriggerRule());
  const [fieldMapping, setFieldMapping] = useState<CampaignFieldMapping>(defaultFieldMapping());
  const [audienceTableId, setAudienceTableId] = useState<string | null>(null);

  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [audienceTables, setAudienceTables] = useState<CampaignAudienceTableRecord[]>([]);
  const [audienceColumns, setAudienceColumns] = useState<DataTableColumn[]>([]);

  const loadAgents = useCallback(async () => {
    const res = await authFetch("/api/voice/agents");
    const json = await res.json();
    if (res.ok) setAgents(json.agents ?? []);
  }, []);

  const loadAudienceTables = useCallback(async () => {
    const res = await authFetch("/api/campaigns/audience-tables");
    const json = await res.json();
    if (res.ok) setAudienceTables(json.tables ?? []);
  }, []);

  const applyCampaign = useCallback((c: VoiceCampaignRecord) => {
    setName(c.name);
    setGoal(c.goal ?? "");
    setVoiceAgentId(c.voice_agent_id ?? "");
    setSchedule(c.schedule_config);
    setTrigger(c.trigger_rule);
    setFieldMapping(c.field_mapping);
    setAudienceTableId(c.audience_table_id);
    setStep(Math.max(1, Math.min(4, c.wizard_step || 1)));
  }, []);

  const loadCampaign = useCallback(async (id: string) => {
    setLoading(true);
    const res = await authFetch(`/api/campaigns/${id}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo cargar la campaña");
      return;
    }
    applyCampaign(json.campaign);
  }, [applyCampaign]);

  useEffect(() => {
    void loadAgents();
    void loadAudienceTables();
  }, [loadAgents, loadAudienceTables]);

  useEffect(() => {
    if (initialCampaignId) void loadCampaign(initialCampaignId);
  }, [initialCampaignId, loadCampaign]);

  useEffect(() => {
    if (!audienceTableId) {
      setAudienceColumns([]);
      return;
    }
    const table = audienceTables.find(t => t.id === audienceTableId);
    if (table) setAudienceColumns(table.columns);
    else {
      void authFetch("/api/campaigns/audience-tables").then(async res => {
        const json = await res.json();
        const found = (json.tables as CampaignAudienceTableRecord[] | undefined)?.find(
          t => t.id === audienceTableId
        );
        if (found) setAudienceColumns(found.columns);
      });
    }
  }, [audienceTableId, audienceTables]);

  const handleBasicsChange = (patch: {
    name?: string;
    goal?: string;
    voice_agent_id?: string;
  }) => {
    if (patch.name !== undefined) setName(patch.name);
    if (patch.goal !== undefined) setGoal(patch.goal);
    if (patch.voice_agent_id !== undefined) setVoiceAgentId(patch.voice_agent_id);
  };

  const saveStep1 = async () => {
    if (!name.trim() || !voiceAgentId) {
      setError("Nombre y agente son obligatorios");
      return;
    }
    setSaving(true);
    setError("");

    if (!campaignId) {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), goal: goal.trim(), voice_agent_id: voiceAgentId }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(json.error ?? "Error al crear");
        return;
      }
      setCampaignId(json.campaign.id);
      router.replace(`/dashboard/campaigns/${json.campaign.id}/editar`);
      setStep(2);
      return;
    }

    const res = await authFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        goal: goal.trim() || null,
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
    applyCampaign(json.campaign);
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
    applyCampaign(json.campaign);
    setStep(3);
  };

  const onAudienceLinked = async (tableId: string) => {
    setAudienceTableId(tableId);
    await loadAudienceTables();
    if (campaignId) await loadCampaign(campaignId);
    setStep(4);
  };

  const saveStep4 = async (activate: boolean) => {
    if (!campaignId) return;
    if (!fieldMapping.phone_column || !fieldMapping.name_column) {
      setError("Mapea teléfono y nombre antes de continuar");
      return;
    }
    setSaving(true);
    setError("");
    const res = await authFetch(`/api/campaigns/${campaignId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_mapping: fieldMapping, activate }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al finalizar");
      return;
    }
    router.push("/dashboard/campaigns");
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else router.push("/dashboard/campaigns");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando campaña…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-noova-main">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[.08] shrink-0">
        <Link
          href="/dashboard/campaigns"
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.06]"
        >
          <X className="w-5 h-5" />
        </Link>
        <p className="text-sm font-medium text-gray-300">Nueva campaña de voz</p>
        <div className="w-9" />
      </div>

      <CampaignWizardStepper currentStep={step} />

      <div className="flex-1 min-h-0 flex flex-col">
        {step === 1 && (
          <CampaignStepBasics
            name={name}
            goal={goal}
            voiceAgentId={voiceAgentId}
            agents={agents}
            onChange={handleBasicsChange}
          />
        )}
        {step === 2 && (
          <CampaignStepSchedule
            schedule={schedule}
            trigger={trigger}
            onScheduleChange={setSchedule}
            onTriggerChange={setTrigger}
          />
        )}
        {step === 3 && campaignId && (
          <CampaignStepAudience
            campaignId={campaignId}
            audienceTableId={audienceTableId}
            existingTables={audienceTables}
            onLinked={id => void onAudienceLinked(id)}
          />
        )}
        {step === 4 && campaignId && (
          <CampaignStepMapping
            campaignId={campaignId}
            mapping={fieldMapping}
            columns={audienceColumns}
            triggerNeedsDate={trigger.type === "excel_date"}
            onChange={setFieldMapping}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-white/[.08] px-6 py-4 flex items-center justify-between gap-4 bg-noova-main">
        <button type="button" onClick={goBack} className={`${btnGhost} gap-2`}>
          <ArrowLeft className="w-4 h-4" /> Atrás
        </button>

        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-400 max-w-xs truncate">{error}</p>}
          {step === 1 && (
            <CampaignContinueButton onClick={() => void saveStep1()} loading={saving} />
          )}
          {step === 2 && (
            <CampaignContinueButton onClick={() => void saveStep2()} loading={saving} />
          )}
          {step === 3 && audienceTableId && (
            <CampaignContinueButton onClick={() => setStep(4)} label="Continuar al mapeo" />
          )}
          {step === 4 && (
            <>
              <button
                type="button"
                onClick={() => void saveStep4(false)}
                disabled={saving}
                className={`${btnGhost} text-sm`}
              >
                Guardar borrador
              </button>
              <CampaignContinueButton
                onClick={() => void saveStep4(true)}
                loading={saving}
                label="Activar campaña"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
