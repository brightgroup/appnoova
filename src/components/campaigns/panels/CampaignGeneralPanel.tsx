"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { CampaignBasicsForm } from "@/components/campaigns/CampaignBasicsForm";
import { CampaignSelect } from "@/components/campaigns/CampaignWizardPanel";
import { defaultCrmConfig, primaryOutputField } from "@/lib/campaigns/output-fields";
import type { VoiceAgentListItem } from "@/types/voice-agent";
import {
  CAMPAIGN_TYPE_DESCRIPTIONS,
  CAMPAIGN_TYPE_LABELS,
  type CampaignType,
  type VoiceCampaignRecord,
} from "@/types/voice-campaign";

interface CampaignGeneralPanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

interface CrmStage {
  id: string;
  name: string;
}

const CAMPAIGN_TYPES = Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[];

export function CampaignGeneralPanel({ campaign, onChange }: CampaignGeneralPanelProps) {
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [loading, setLoading] = useState(true);

  const locked = campaign.status !== "draft";
  const crm = campaign.crm_config;
  const primary = primaryOutputField(campaign.output_fields);

  const load = useCallback(async () => {
    setLoading(true);
    const [agentsRes, stagesRes] = await Promise.all([
      authFetch("/api/voice/agents"),
      authFetch("/api/crm/stages"),
    ]);
    const agentsJson = await agentsRes.json().catch(() => ({}));
    if (agentsRes.ok) setAgents(agentsJson.agents ?? []);
    const stagesJson = await stagesRes.json().catch(() => ({}));
    if (stagesRes.ok) setStages(stagesJson.stages ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setType = (type: CampaignType) => {
    onChange({ campaign_type: type, crm_config: defaultCrmConfig(type) });
  };

  const toggleInterestValue = (value: string) => {
    const set = new Set(crm.interest_values);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange({ crm_config: { ...crm, interest_values: [...set] } });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Datos generales</h2>
            <p className="text-xs text-gray-500">Nombre, objetivo y agente que ejecuta la campaña.</p>
          </div>
          <CampaignBasicsForm
            name={campaign.name}
            goal={campaign.goal ?? ""}
            voiceAgentId={campaign.voice_agent_id ?? ""}
            agents={agents}
            onChange={patch => onChange(patch)}
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Tipo de campaña</h2>
              <p className="text-xs text-gray-500">
                Define si la campaña crea leads y oportunidades en el embudo, y cuándo.
              </p>
            </div>
            {locked && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 shrink-0">
                <Lock className="w-3 h-3" /> Fijado al activar
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CAMPAIGN_TYPES.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => !locked && setType(type)}
                disabled={locked && campaign.campaign_type !== type}
                className={`rounded-xl border p-3.5 text-left transition-colors disabled:opacity-40 ${
                  campaign.campaign_type === type
                    ? "border-[#0f7eff]/40 bg-[#0f7eff]/8"
                    : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
                }`}
              >
                <p className="text-sm font-medium text-white">{CAMPAIGN_TYPE_LABELS[type]}</p>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  {CAMPAIGN_TYPE_DESCRIPTIONS[type]}
                </p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Comportamiento CRM (ajustable por campaña)
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1.5">
                  Creación de leads y oportunidades
                </label>
                <CampaignSelect
                  value={crm.create_leads}
                  onChange={e =>
                    onChange({
                      crm_config: {
                        ...crm,
                        create_leads: e.target.value as typeof crm.create_leads,
                      },
                    })
                  }
                >
                  <option value="on_interest">Cuando la IA detecta interés</option>
                  <option value="on_import">Al cargar el Excel (todos)</option>
                  <option value="never">Nunca</option>
                </CampaignSelect>
              </div>

              {crm.create_leads !== "never" && (
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1.5">
                    Etapa del embudo para nuevas oportunidades
                  </label>
                  <CampaignSelect
                    value={crm.pipeline_stage_id ?? ""}
                    onChange={e =>
                      onChange({
                        crm_config: { ...crm, pipeline_stage_id: e.target.value || null },
                      })
                    }
                  >
                    <option value="">Primera etapa del embudo</option>
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </CampaignSelect>
                </div>
              )}
            </div>

            {crm.create_leads === "on_interest" && (
              <div>
                <label className="text-[11px] text-gray-500 block mb-1.5">
                  Valores de la tipificación principal que significan &ldquo;interés&rdquo;
                </label>
                {primary ? (
                  <div className="flex flex-wrap gap-1.5">
                    {primary.options.map(opt => {
                      const active = crm.interest_values.some(
                        v => v.trim().toLowerCase() === opt.trim().toLowerCase()
                      );
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleInterestValue(opt)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border-white/[.10] bg-white/[.03] text-gray-400 hover:text-white"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Primero define la tipificación principal en la pestaña{" "}
                    <span className="text-gray-300">Campos de salida</span>.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
