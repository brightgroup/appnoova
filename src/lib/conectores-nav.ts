import { Calendar, type LucideIcon } from "lucide-react";

export interface ConectorNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const CONECTORES_NAV: ConectorNavItem[] = [
  { name: "Google Calendar", href: "/dashboard/conectores/google-calendar", icon: Calendar }
];
