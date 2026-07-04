"use client";

import { CampaignMappingFields } from "@/components/campaigns/CampaignMappingFields";
import { CampaignWizardPanel } from "@/components/campaigns/CampaignWizardPanel";
import type { CampaignFieldMapping } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

interface CampaignStepMappingProps {
  campaignId: string;
  mapping: CampaignFieldMapping;
  columns: DataTableColumn[];
  triggerNeedsDate: boolean;
  onChange: (mapping: CampaignFieldMapping) => void;
}

export function CampaignStepMapping({
  campaignId,
  mapping,
  columns,
  triggerNeedsDate,
  onChange,
}: CampaignStepMappingProps) {
  return (
    <CampaignWizardPanel>
      <CampaignMappingFields
        campaignId={campaignId}
        mapping={mapping}
        columns={columns}
        triggerNeedsDate={triggerNeedsDate}
        onChange={onChange}
      />
    </CampaignWizardPanel>
  );
}
