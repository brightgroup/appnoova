import { Users, Kanban, type LucideIcon } from "lucide-react";

export interface CrmNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const CRM_NAV: CrmNavItem[] = [
  { name: "Contactos", href: "/dashboard/crm/contactos", icon: Users },
  { name: "Leads", href: "/dashboard/crm/leads", icon: Kanban }
];
