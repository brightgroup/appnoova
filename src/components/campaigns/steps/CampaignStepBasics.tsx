"use client";

import type { VoiceAgentListItem } from "@/types/voice-agent";
import {
  CampaignFieldLabel,
  CampaignInput,
  CampaignTextarea,
  CampaignSelect,
  CampaignWizardPanel,
} from "@/components/campaigns/CampaignWizardPanel";

interface CampaignStepBasicsProps {
  name: string;
  goal: string;
  voiceAgentId: string;
  agents: VoiceAgentListItem[];
  onChange: (patch: { name?: string; goal?: string; voice_agent_id?: string }) => void;
}

export function CampaignStepBasics({
  name,
  goal,
  voiceAgentId,
  agents,
  onChange,
}: CampaignStepBasicsProps) {
  return (
    <CampaignWizardPanel
      title="Crea tu campaña"
      description="Ponle un nombre, describe el objetivo y elige el agente de voz que realizará las llamadas."
    >
      <div className="space-y-5">
        <div>
          <CampaignFieldLabel label="Nombre de la campaña" required />
          <CampaignInput
            value={name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="Ej. Renovación pólizas Arcary"
          />
        </div>

        <div>
          <CampaignFieldLabel
            label="Objetivo de la campaña"
            hint="Opcional. La IA usará esto como contexto en cada llamada."
          />
          <CampaignTextarea
            value={goal}
            onChange={e => onChange({ goal: e.target.value })}
            placeholder="Ej. Recordar a cada cliente la renovación de su póliza un mes antes del vencimiento."
          />
        </div>

        <div>
          <CampaignFieldLabel label="Agente de voz" required />
          <CampaignSelect
            value={voiceAgentId}
            onChange={e => onChange({ voice_agent_id: e.target.value })}
          >
            <option value="">Seleccionar agente…</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.source_template ? ` · ${a.source_template}` : ""}
              </option>
            ))}
          </CampaignSelect>
        </div>
      </div>
    </CampaignWizardPanel>
  );
}
