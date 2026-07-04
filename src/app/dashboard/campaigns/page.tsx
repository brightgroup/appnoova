import { CampaignsPageClient } from "@/components/campaigns/CampaignsPageClient";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ wizard?: string }>;
}) {
  const { wizard } = await searchParams;
  return <CampaignsPageClient initialWizardId={wizard ?? null} />;
}
