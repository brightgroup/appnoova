import { Bot, History, Phone, FlaskConical, Network, PhoneCall, type LucideIcon } from "lucide-react";

export interface AgenteVozNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const AGENTES_VOZ_NAV: AgenteVozNavItem[] = [
  { name: "Agentes", href: "/dashboard/agentes-voz", icon: Bot },
  { name: "Historial", href: "/dashboard/agentes-voz/historial", icon: History },
  { name: "Números telefónicos", href: "/dashboard/agentes-voz/numeros", icon: Phone },
  { name: "Números de prueba", href: "/dashboard/agentes-voz/numeros-prueba", icon: FlaskConical },
  { name: "Troncales SIP", href: "#", icon: Network },
  { name: "Teléfono (canales)", href: "/dashboard/canales/telefono", icon: PhoneCall }
];
