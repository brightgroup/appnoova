import { getAppBaseUrl } from "@/lib/telephony/app-url";

const CANONICAL_APP_URL = "https://app.noova360.com";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalOrIpHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  );
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** URL pública canónica de la app (sin IP ni localhost). */
export function resolvePublicAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    const host = hostFromUrl(fromEnv);
    if (host && !isLocalOrIpHost(host)) {
      return normalizeBaseUrl(fromEnv);
    }
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (!isLocalOrIpHost(host)) {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  const serverBase = getAppBaseUrl();
  const serverHost = hostFromUrl(serverBase);
  if (serverHost && !isLocalOrIpHost(serverHost)) {
    return normalizeBaseUrl(serverBase);
  }

  return CANONICAL_APP_URL;
}

/** URL de ingreso sin marca Noova — compartida por clientes agencia. */
export function getAgencyAccessLoginUrl(): string {
  return `${resolvePublicAppBaseUrl()}/acceso`;
}
