import { Car, FileWarning, ShieldCheck, type LucideIcon } from "lucide-react";

export interface SegurosNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Pantallas de trabajo del corredor (no conectores — esos viven en /dashboard/conectores, ver
 * Fase 2.1 del plan). "Renovaciones" ya no es entrada de primer nivel: vive como pestaña dentro
 * de Pólizas (ver la barra de pestañas en polizas/page.tsx y renovaciones/page.tsx).
 */
export const SEGUROS_NAV: SegurosNavItem[] = [
  { name: "Pólizas", href: "/dashboard/seguros/polizas", icon: ShieldCheck },
  { name: "Cotizaciones", href: "/dashboard/seguros/cotizaciones", icon: Car },
  { name: "Siniestros", href: "/dashboard/seguros/siniestros", icon: FileWarning }
];
