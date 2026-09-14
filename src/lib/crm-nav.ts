import { Users, Kanban, FileText, ClipboardList, type LucideIcon } from "lucide-react";

export interface CrmNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Si es true, el ítem solo se muestra a organizaciones con el módulo indicado activo (ver dashboard/layout.tsx) — hoy solo "Solicitudes"/"Cotizaciones" lo usan, porque su plantilla es 100% de seguros. */
  requiresModule?: "seguros";
}

export const CRM_NAV: CrmNavItem[] = [
  { name: "Contactos", href: "/dashboard/crm/contactos", icon: Users },
  { name: "Leads", href: "/dashboard/crm/leads", icon: Kanban },
  // Solicitudes = insurance_quote_requests en estado "pendiente" (reuniendo datos, sin resultado
  // todavía) — Cotizaciones = las mismas filas una vez tienen resultado. Misma tabla, dos
  // entidades separadas para el usuario (decisión explícita, ver plan "Solicitudes independientes").
  { name: "Solicitudes", href: "/dashboard/crm/solicitudes", icon: ClipboardList, requiresModule: "seguros" },
  { name: "Cotizaciones", href: "/dashboard/crm/cotizaciones", icon: FileText, requiresModule: "seguros" }
];
