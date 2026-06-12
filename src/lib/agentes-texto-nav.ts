import { Bot, Inbox, FileText, Users, LayoutTemplate, type LucideIcon } from "lucide-react";

export interface AgenteTextoNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const AGENTES_TEXTO_NAV: AgenteTextoNavItem[] = [
  { name: "Agentes", href: "/dashboard/agentes-texto", icon: Bot },
  { name: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { name: "Text Logs", href: "#", icon: FileText },
  { name: "Equipos", href: "#", icon: Users },
  { name: "Plantillas", href: "#", icon: LayoutTemplate }
];
