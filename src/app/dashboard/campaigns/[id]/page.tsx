"use client";

import { Suspense, use } from "react";
import { CampaignDetailView } from "@/components/campaigns/CampaignDetailView";

export default function CampanaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Cargando…
        </div>
      }
    >
      <CampaignDetailView campaignId={id} />
    </Suspense>
  );
}
