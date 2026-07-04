import type { CampaignDetailTab } from "@/types/voice-campaign";

const VALID_TABS = new Set<CampaignDetailTab>([
  "general",
  "guion",
  "audiencia",
  "programacion",
  "conexiones",
  "registro",
  "metricas",
]);

export function parseCampaignDetailTab(raw: string | null | undefined): CampaignDetailTab {
  if (raw && VALID_TABS.has(raw as CampaignDetailTab)) return raw as CampaignDetailTab;
  if (raw === "configuracion") return "general";
  if (raw === "contactos") return "audiencia";
  return "general";
}
