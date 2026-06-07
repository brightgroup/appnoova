/** Etiquetas legibles para features de Telnyx (API → UI). */
export const TELNYX_FEATURE_LABELS: Record<string, string> = {
  voice: "Voz",
  sms: "SMS",
  mms: "MMS",
  fax: "Fax",
  emergency: "Emergencia",
  hd_voice: "HD Voice",
  international_sms: "SMS Intl.",
  local_calling: "Llamada local"
};

export function telnyxFeatureLabel(name: string): string {
  const key = name.toLowerCase().trim();
  return TELNYX_FEATURE_LABELS[key] ?? name;
}

export function normalizeTelnyxFeatures(
  features: { name?: string }[] | undefined
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of features ?? []) {
    const key = f.name?.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
