"use client";

import { use } from "react";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";

export default function EditarCampanaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CampaignWizard campaignId={id} />;
}
