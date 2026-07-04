"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { CampaignBasicsForm } from "@/components/campaigns/CampaignBasicsForm";
import type { VoiceAgentListItem } from "@/types/voice-agent";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";

interface CampaignGeneralPanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

export function CampaignGeneralPanel({ campaign, onChange }: CampaignGeneralPanelProps) {
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/voice/agents");
    const json = await res.json();
    if (res.ok) setAgents(json.agents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
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
      </div>
    </div>
  );
}
