import type { PhoneNumberType } from "@/types/phone-number";

export function isVerifiedNumber(type: PhoneNumberType | string): boolean {
  return type === "verified_caller_id";
}

export function isPurchasedNumber(type: PhoneNumberType | string): boolean {
  return type === "purchased" || type === "ported";
}

/** Etiqueta de pestaña / categoría */
export function numberCategoryLabel(type: PhoneNumberType | string): string {
  if (isVerifiedNumber(type)) return "Verificado";
  if (type === "ported") return "Portado";
  return "Comprado";
}

/** Columna de uso en la tabla */
export function numberUsageLabel(type: PhoneNumberType | string): string {
  if (isVerifiedNumber(type)) return "Solo outbound";
  return "Inbound y outbound";
}

export function numberUsageBadgeClass(type: PhoneNumberType | string): string {
  if (isVerifiedNumber(type)) {
    return "bg-amber-500/15 text-amber-300";
  }
  return "bg-[#5b5bf6]/15 text-[#a5a5ff]";
}
