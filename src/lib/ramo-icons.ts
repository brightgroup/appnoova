import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Car,
  Coins,
  CreditCard,
  FileCheck,
  FileText,
  Flame,
  GraduationCap,
  HardHat,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  PawPrint,
  Percent,
  PiggyBank,
  Ship,
  Shield,
  ShieldCheck,
  Sprout,
  Stethoscope,
  Truck,
  Umbrella,
  Users,
  Wrench,
  Zap
} from "lucide-react";

/**
 * Iconos ESTANDARIZADOS por ramo — a diferencia de crm-stage-icons.ts (donde
 * el usuario elige el ícono de cada etapa), acá el ícono es fijo por ramo,
 * igual para toda la plataforma, no configurable. Indexado por el slug real
 * de `ramos_catalogo` (migración 134, sembrado desde Softseguros). Solo se
 * curan a mano los ramos reconocibles/comunes — el resto (la cola larga de
 * ~45 ramos muy nicho, ej. "garantias-aduaneras") cae al fallback genérico
 * en vez de inventar una semántica que no se puede confirmar.
 */
export interface RamoIconEntry {
  icon: LucideIcon;
  color: string;
}

const FALLBACK: RamoIconEntry = { icon: Shield, color: "#9ca3af" };

export const RAMO_ICONS: Record<string, RamoIconEntry> = {
  "autos-vehiculos": { icon: Car, color: "#3b82f6" },
  "venta-de-vehiculo": { icon: Car, color: "#3b82f6" },
  casco: { icon: Car, color: "#3b82f6" },
  soat: { icon: Car, color: "#0ea5e9" },

  vida: { icon: Heart, color: "#ef4444" },
  "vida-grupo": { icon: Users, color: "#ef4444" },
  "vida-individual": { icon: Heart, color: "#ef4444" },
  "vida-deudores": { icon: Heart, color: "#ef4444" },
  "vida-ley": { icon: Heart, color: "#ef4444" },

  salud: { icon: HeartPulse, color: "#ec4899" },
  "asistencia-medica": { icon: Stethoscope, color: "#ec4899" },
  "gastos-medicos": { icon: Stethoscope, color: "#ec4899" },
  "medicina-prepagada": { icon: Stethoscope, color: "#ec4899" },
  oncologico: { icon: HeartPulse, color: "#ec4899" },
  "rc-profesionales-medicos": { icon: Stethoscope, color: "#ec4899" },
  medicos: { icon: Stethoscope, color: "#ec4899" },
  eps: { icon: HeartPulse, color: "#ec4899" },
  enfermedades: { icon: HeartPulse, color: "#ec4899" },

  hogar: { icon: Home, color: "#f59e0b" },
  copropiedades: { icon: Building2, color: "#f59e0b" },
  arrendamiento: { icon: Home, color: "#f59e0b" },
  "incendio-y-lineas-aliadas": { icon: Flame, color: "#f97316" },
  terremoto: { icon: Home, color: "#f59e0b" },

  arl: { icon: HardHat, color: "#eab308" },
  sctr: { icon: HardHat, color: "#eab308" },
  "formacion-laboral": { icon: HardHat, color: "#eab308" },

  pyme: { icon: Briefcase, color: "#8b5cf6" },
  generales: { icon: Briefcase, color: "#8b5cf6" },
  "colectivo": { icon: Users, color: "#8b5cf6" },
  personas: { icon: Users, color: "#8b5cf6" },

  cumplimiento: { icon: FileCheck, color: "#22c55e" },
  "cumplimiento-de-contrato": { icon: FileCheck, color: "#22c55e" },
  "seriedad-de-oferta": { icon: FileCheck, color: "#22c55e" },
  "credito-y-caucion": { icon: FileCheck, color: "#22c55e" },
  "buen-uso-de-anticipo": { icon: FileCheck, color: "#22c55e" },
  "garantias-aduaneras": { icon: FileCheck, color: "#22c55e" },

  "responsabilidad-civil": { icon: ShieldCheck, color: "#14b8a6" },
  "rc-contra-y-extra": { icon: ShieldCheck, color: "#14b8a6" },
  "rc-directores-y-administradores": { icon: ShieldCheck, color: "#14b8a6" },
  "rc-parqueaderos": { icon: ShieldCheck, color: "#14b8a6" },

  "todo-riesgo": { icon: ShieldCheck, color: "#0f7eff" },
  "todo-riesgo-construccion": { icon: HardHat, color: "#0f7eff" },
  "todo-riesgo-contratista": { icon: HardHat, color: "#0f7eff" },

  transporte: { icon: Truck, color: "#6366f1" },
  "fianzas-robo-sustraccion": { icon: ShieldCheck, color: "#6366f1" },
  "robo-o-asalto": { icon: ShieldCheck, color: "#6366f1" },
  manejo: { icon: Briefcase, color: "#6366f1" },
  fidelidad: { icon: ShieldCheck, color: "#6366f1" },

  "viajes-turismo": { icon: Plane, color: "#06b6d4" },
  aviacion: { icon: Plane, color: "#06b6d4" },
  maritimo: { icon: Ship, color: "#06b6d4" },

  mascotas: { icon: PawPrint, color: "#84cc16" },
  agropecuario: { icon: Sprout, color: "#84cc16" },

  exequias: { icon: Umbrella, color: "#a855f7" },

  educativo: { icon: GraduationCap, color: "#f472b6" },
  "renta-educativa": { icon: GraduationCap, color: "#f472b6" },
  estudiantil: { icon: GraduationCap, color: "#f472b6" },

  "equipo-electrico": { icon: Zap, color: "#facc15" },
  "equipo-y-maquinaria-de-contratista": { icon: Wrench, color: "#facc15" },
  "maquinaria-y-equipo-rotura-maquinaria": { icon: Wrench, color: "#facc15" },
  "rotura-de-maquinaria": { icon: Wrench, color: "#facc15" },
  "montaje-de-maquinaria": { icon: Wrench, color: "#facc15" },
  "perdida-de-beneficio-por-rotura-de-maquinaria": { icon: Wrench, color: "#facc15" },

  "dinero-y-valores": { icon: Coins, color: "#10b981" },
  inversion: { icon: PiggyBank, color: "#10b981" },
  ahorro: { icon: PiggyBank, color: "#10b981" },
  "renta-pensional": { icon: Landmark, color: "#10b981" },
  "titulo-capitalizacion": { icon: Coins, color: "#10b981" },
  "financiacion-de-primas": { icon: CreditCard, color: "#10b981" },
  "financiacion-primas": { icon: CreditCard, color: "#10b981" },
  "seguro-de-credito": { icon: Percent, color: "#10b981" },
  "riesgos-financieros": { icon: Percent, color: "#10b981" },

  juridica: { icon: FileText, color: "#78716c" },
  "proteccion-de-datos": { icon: FileText, color: "#78716c" },
  "danos-materiales": { icon: FileText, color: "#78716c" },
  multiriesgo: { icon: ShieldCheck, color: "#78716c" },

  ingenieria: { icon: HardHat, color: "#0ea5e9" },
  "obras-civiles-terminadas": { icon: HardHat, color: "#0ea5e9" },
  "ejecucion-de-obra-y-buena-calidad-de-materiales": { icon: HardHat, color: "#0ea5e9" },

  vidrios: { icon: Home, color: "#38bdf8" },
  microseguro: { icon: Shield, color: "#9ca3af" },
  "plan-complementario": { icon: HeartPulse, color: "#ec4899" },
  pos: { icon: CreditCard, color: "#10b981" },
  "bancos-e-instituciones-financieras-bbb": { icon: Landmark, color: "#10b981" },
  "riesgos-especiales": { icon: Shield, color: "#9ca3af" },
  "riesgos-diversos": { icon: Shield, color: "#9ca3af" },
  "seguros-de-accidentes": { icon: HeartPulse, color: "#ec4899" },
  "accidentes-personales": { icon: HeartPulse, color: "#ec4899" },
  accidentes: { icon: HeartPulse, color: "#ec4899" },
  patrimoniales: { icon: Briefcase, color: "#8b5cf6" },
  "lucro-cesante": { icon: Coins, color: "#10b981" }
};

export function resolveRamoIcon(slug: string | null | undefined): RamoIconEntry {
  if (!slug) return FALLBACK;
  return RAMO_ICONS[slug] ?? FALLBACK;
}
