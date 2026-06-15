import type { CrmFieldProvenance, CrmFieldProvenanceEntry } from "@/types/crm";

export function manualProvenanceEntry(userId: string): CrmFieldProvenanceEntry {
  return {
    origen: "manual",
    confianza: null,
    verificado: true,
    actualizado_por: userId,
    actualizado_en: new Date().toISOString()
  };
}

export function whatsappProvenanceEntry(
  at: string,
  confidence: "alta" | "media" = "alta",
  verified = false
): CrmFieldProvenanceEntry {
  return {
    origen: "whatsapp",
    confianza: confidence,
    verificado: verified,
    actualizado_por: "whatsapp",
    actualizado_en: at
  };
}

export function markFieldsVerified(
  prev: CrmFieldProvenance,
  fields: string[],
  userId: string
): CrmFieldProvenance {
  const next = { ...prev };
  const entry = manualProvenanceEntry(userId);
  for (const f of fields) next[f] = entry;
  return next;
}

export function mergeManualProvenance(
  prev: CrmFieldProvenance,
  changedFields: string[],
  userId: string
): CrmFieldProvenance {
  return markFieldsVerified(prev, changedFields, userId);
}

/** ¿Se puede sobrescribir automáticamente (WhatsApp / IA) sin tocar datos verificados manualmente? */
export function canAutoUpdateField(
  field: string,
  currentValue: unknown,
  provenance: CrmFieldProvenanceEntry | undefined,
  options?: { treatPhoneAsEmpty?: string }
): boolean {
  const empty =
    currentValue == null ||
    (typeof currentValue === "string" && !currentValue.trim()) ||
    (Array.isArray(currentValue) && currentValue.length === 0);

  if (empty) return true;

  if (options?.treatPhoneAsEmpty && typeof currentValue === "string") {
    const v = currentValue.trim();
    if (v === options.treatPhoneAsEmpty || /^\+?\d{10,15}$/.test(v.replace(/\s/g, ""))) {
      return true;
    }
  }

  if (!provenance) return false;
  if (provenance.verificado || provenance.origen === "manual") return false;
  return provenance.origen === "ia_conversacion" || provenance.origen === "whatsapp" || provenance.origen === "integracion";
}

export const ORIGIN_LABELS: Record<CrmFieldProvenanceEntry["origen"], string> = {
  manual: "Manual",
  ia_conversacion: "IA (conversación)",
  documento: "Documento",
  importacion: "Importación",
  integracion: "Integración",
  whatsapp: "WhatsApp"
};
