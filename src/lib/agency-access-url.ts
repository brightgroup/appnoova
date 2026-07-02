import { getAppBaseUrl } from "@/lib/telephony/app-url";

/** URL de ingreso sin marca Noova — compartida por clientes agencia. */
export function getAgencyAccessLoginUrl(): string {
  return `${getAppBaseUrl()}/acceso`;
}
