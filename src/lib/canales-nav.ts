import { Link2, Code2, MessageCircle, Phone, type LucideIcon } from "lucide-react";

export interface CanalNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const CANALES_NAV: CanalNavItem[] = [
  { name: "Mi Link", href: "/dashboard/canales/mi-link", icon: Link2 },
  { name: "Widget web", href: "/dashboard/canales/widget", icon: Code2 },
  { name: "WhatsApp", href: "/dashboard/canales/whatsapp", icon: MessageCircle },
  { name: "Teléfono", href: "/dashboard/canales/telefono", icon: Phone }
];
