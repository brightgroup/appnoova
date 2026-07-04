import { CampaignDetailView } from "@/components/campaigns/CampaignDetailView";
import { parseCampaignDetailTab } from "@/lib/campaigns/detail-tab";

export default async function CampanaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  return <CampaignDetailView campaignId={id} initialTab={parseCampaignDetailTab(tab)} />;
}
