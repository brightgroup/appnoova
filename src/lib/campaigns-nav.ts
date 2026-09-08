import { Target, MessageCircle, type LucideIcon } from "lucide-react";

export interface CampaignsNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const CAMPAIGNS_NAV: CampaignsNavItem[] = [
  { name: "Campañas de voz", href: "/dashboard/campaigns", icon: Target },
  { name: "Campañas de WhatsApp", href: "/dashboard/campanas-whatsapp", icon: MessageCircle },
];
