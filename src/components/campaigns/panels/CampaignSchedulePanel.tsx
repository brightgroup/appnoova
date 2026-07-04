"use client";

import { CampaignStepSchedule } from "@/components/campaigns/steps/CampaignStepSchedule";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";

interface CampaignSchedulePanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

export function CampaignSchedulePanel({ campaign, onChange }: CampaignSchedulePanelProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Programación y modalidad</h2>
          <p className="text-xs text-gray-500">
            Define cuándo se disparan las llamadas, los horarios de atención y los reintentos.
          </p>
        </div>
        <CampaignStepSchedule
          schedule={campaign.schedule_config}
          trigger={campaign.trigger_rule}
          onScheduleChange={schedule_config => onChange({ schedule_config })}
          onTriggerChange={trigger_rule => onChange({ trigger_rule })}
          embedded
        />
      </div>
    </div>
  );
}
