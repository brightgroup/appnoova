import { Target, type LucideIcon } from "lucide-react";

export interface CampaignsNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const CAMPAIGNS_NAV: CampaignsNavItem[] = [
  { name: "Campañas de voz", href: "/dashboard/campaigns", icon: Target },
];
