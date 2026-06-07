/** Normaliza a E.164 (+ dígitos). */
export function toE164(raw: string, defaultCountry = "57"): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && defaultCountry === "57") return `+57${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function e164Matches(a: string, b: string): boolean {
  const na = toE164(a);
  const nb = toE164(b);
  if (!na || !nb) return false;
  return na === nb;
}
