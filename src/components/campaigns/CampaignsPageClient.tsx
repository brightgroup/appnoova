"use client";

import dynamic from "next/dynamic";
import { CampaignsPageLoadingFallback } from "@/components/campaigns/CampaignsPageLoadingFallback";

const CampaignsPageContent = dynamic(
  () =>
    import("@/components/campaigns/CampaignsPageContent").then((mod) => mod.CampaignsPageContent),
  {
    ssr: false,
    loading: () => <CampaignsPageLoadingFallback />,
  }
);

interface CampaignsPageClientProps {
  initialWizardId?: string | null;
}

export function CampaignsPageClient({ initialWizardId = null }: CampaignsPageClientProps) {
  return <CampaignsPageContent initialWizardId={initialWizardId} />;
}
