/** Formato legible: +573152501481 → +57 3152501481 */
export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (e164.startsWith("+1") && digits.length === 11) {
    return `+1 ${digits.slice(1)}`;
  }
  if (e164.startsWith("+57") && digits.length >= 12) {
    return `+57 ${digits.slice(2)}`;
  }
  if (e164.startsWith("+")) {
    const cc = digits.slice(0, 2);
    return `+${cc} ${digits.slice(2)}`;
  }
  return e164;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    return iso;
  }
}
