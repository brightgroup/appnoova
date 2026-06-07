/** Países soportados para búsqueda Telnyx (LATAM + US). */
export const TELEPHONY_COUNTRIES = [
  { code: "US", label: "Estados Unidos", dial: "+1", flag: "🇺🇸" },
  { code: "CO", label: "Colombia", dial: "+57", flag: "🇨🇴" },
  { code: "MX", label: "México", dial: "+52", flag: "🇲🇽" },
  { code: "AR", label: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "CL", label: "Chile", dial: "+56", flag: "🇨🇱" },
  { code: "PE", label: "Perú", dial: "+51", flag: "🇵🇪" },
  { code: "BR", label: "Brasil", dial: "+55", flag: "🇧🇷" },
  { code: "EC", label: "Ecuador", dial: "+593", flag: "🇪🇨" },
  { code: "PA", label: "Panamá", dial: "+507", flag: "🇵🇦" },
  { code: "CR", label: "Costa Rica", dial: "+506", flag: "🇨🇷" },
] as const;

export type TelephonyCountryCode = (typeof TELEPHONY_COUNTRIES)[number]["code"];

export function countryLabel(code: string): string {
  return TELEPHONY_COUNTRIES.find(c => c.code === code)?.label ?? code;
}
