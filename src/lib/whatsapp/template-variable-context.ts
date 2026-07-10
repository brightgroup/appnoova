/**
 * Contexto para autorellenar variables de plantillas WhatsApp
 * desde el contacto CRM / metadatos de la conversación.
 */
export interface WhatsAppTemplateVariableContext {
  contact_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  document_name?: string | null;
}

const SYNONYMS: Record<string, (keyof WhatsAppTemplateVariableContext)[]> = {
  contact_name: ["contact_name"],
  nombre: ["contact_name"],
  name: ["contact_name"],
  cliente: ["contact_name"],
  first_name: ["contact_name"],
  company_name: ["company_name"],
  empresa: ["company_name"],
  company: ["company_name"],
  organizacion: ["company_name"],
  organization: ["company_name"],
  phone: ["phone"],
  telefono: ["phone"],
  whatsapp: ["phone"],
  celular: ["phone"],
  email: ["email"],
  correo: ["email"],
  city: ["city"],
  ciudad: ["city"],
  document_name: ["document_name"],
  documento: ["document_name"],
};

function normalizeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueForLabel(
  label: string,
  ctx: WhatsAppTemplateVariableContext
): string {
  const key = normalizeKey(label);
  const fields = SYNONYMS[key] ?? [key as keyof WhatsAppTemplateVariableContext];
  for (const field of fields) {
    const raw = ctx[field];
    if (raw != null && String(raw).trim()) return String(raw).trim();
  }
  return "";
}

/** Devuelve un valor por cada variable_labels, en el mismo orden. */
export function resolveTemplateVariableValues(
  labels: string[],
  ctx: WhatsAppTemplateVariableContext | null | undefined
): string[] {
  if (!labels.length) return [];
  if (!ctx) return labels.map(() => "");
  return labels.map(label => valueForLabel(label, ctx));
}

export function countFilledTemplateVariables(values: string[]): number {
  return values.filter(v => v.trim()).length;
}
