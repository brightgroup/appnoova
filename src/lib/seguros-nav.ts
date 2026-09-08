import { Car, FileWarning, ShieldCheck, BellRing, type LucideIcon } from "lucide-react";

export interface SegurosNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/** Pantallas de trabajo del corredor (no conectores — esos viven en /dashboard/conectores, ver Fase 2.1 del plan). */
export const SEGUROS_NAV: SegurosNavItem[] = [
  { name: "Cartera", href: "/dashboard/seguros/polizas", icon: ShieldCheck },
  { name: "Renovaciones", href: "/dashboard/seguros/renovaciones", icon: BellRing },
  { name: "Cotizaciones", href: "/dashboard/seguros/cotizaciones", icon: Car },
  { name: "Siniestros", href: "/dashboard/seguros/siniestros", icon: FileWarning }
];
