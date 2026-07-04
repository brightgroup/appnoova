import { Loader2 } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";

/** Skeleton idéntico en servidor y cliente — evita mismatch de hidratación. */
export function CampaignsPageLoadingFallback() {
  return (
    <ChannelListPage
      title="Campañas de voz"
      description="Automatiza llamadas salientes con tus agentes de IA. Programa recordatorios, seguimientos y más."
      loading
    >
      {null}
    </ChannelListPage>
  );
}
