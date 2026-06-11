export const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1–10 personas" },
  { value: "11-50", label: "11–50 personas" },
  { value: "51-200", label: "51–200 personas" },
  { value: "201-500", label: "201–500 personas" },
  { value: "500+", label: "Más de 500 personas" }
] as const;

export type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number]["value"];

export interface LandingLeadPayload {
  source: string;
  plan_interest?: string | null;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  company_size: CompanySize;
  message?: string | null;
}

export interface LandingLeadRecord extends LandingLeadPayload {
  id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function companySizeLabel(value: string): string {
  return COMPANY_SIZE_OPTIONS.find(o => o.value === value)?.label ?? value;
}

export function planInterestLabel(plan: string | null | undefined): string {
  if (!plan) return "—";
  const labels: Record<string, string> = {
    explorador: "Explorador (gratis)",
    esencial: "Esencial ($82/mes)",
    crecimiento: "Crecimiento ($345/mes)",
    escala: "Escala ($815/mes)",
    corporativo: "Corporativo",
    demo: "Agendar demo",
    contacto: "Contacto general"
  };
  return labels[plan] ?? plan;
}
