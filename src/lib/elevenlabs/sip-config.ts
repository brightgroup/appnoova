import { resolveTelnyxSipCredentials } from "@/lib/elevenlabs/telnyx-sip-credentials";

export type SipTransport = "auto" | "udp" | "tcp" | "tls";
export type SipMediaEncryption = "disabled" | "allowed" | "required";

export interface PlatformSipConfig {
  outboundAddress: string;
  transport: SipTransport;
  mediaEncryption: SipMediaEncryption;
  username: string | null;
  password: string | null;
  inboundAllowedAddresses: string[];
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function basePlatformSipConfig(): Omit<PlatformSipConfig, "username" | "password"> | null {
  const telnyxConfigured = Boolean(process.env.TELNYX_API_KEY?.trim());
  const outboundAddress =
    process.env.ELEVENLABS_SIP_OUTBOUND_ADDRESS?.trim()
    || (telnyxConfigured ? "sip.telnyx.com" : null);
  if (!outboundAddress) return null;

  const transport = (process.env.ELEVENLABS_SIP_TRANSPORT?.trim() || "tcp") as SipTransport;
  const mediaEncryption = (process.env.ELEVENLABS_SIP_MEDIA_ENCRYPTION?.trim() || "allowed") as SipMediaEncryption;

  return {
    outboundAddress,
    transport,
    mediaEncryption,
    inboundAllowedAddresses: parseCsv(process.env.ELEVENLABS_SIP_INBOUND_ALLOWED_ADDRESSES),
  };
}

/** Credenciales SIP plataforma (Telnyx ↔ ElevenLabs) — sync, sin credenciales Telnyx API. */
export function getPlatformSipConfig(): PlatformSipConfig | null {
  const base = basePlatformSipConfig();
  if (!base) return null;

  return {
    ...base,
    username: process.env.ELEVENLABS_SIP_USERNAME?.trim() || null,
    password: process.env.ELEVENLABS_SIP_PASSWORD?.trim() || null,
  };
}

/** Resuelve config SIP incluyendo credenciales Telnyx vía API si faltan en env. */
export async function resolvePlatformSipConfig(): Promise<PlatformSipConfig> {
  const base = basePlatformSipConfig();
  if (!base) {
    throw new Error(
      "SIP premium no configurado — define ELEVENLABS_SIP_OUTBOUND_ADDRESS o TELNYX_API_KEY"
    );
  }

  let username = process.env.ELEVENLABS_SIP_USERNAME?.trim() || null;
  let password = process.env.ELEVENLABS_SIP_PASSWORD?.trim() || null;

  if (!username || !password) {
    const telnyxCreds = await resolveTelnyxSipCredentials();
    if (telnyxCreds) {
      username = telnyxCreds.username;
      password = telnyxCreds.password;
    }
  }

  if (!username || !password) {
    throw new Error(
      "Telnyx requiere autenticación SIP — define ELEVENLABS_SIP_USERNAME/PASSWORD o configura TELNYX_API_KEY con una Credential Connection"
    );
  }

  return { ...base, username, password };
}

export async function requirePlatformSipConfig(): Promise<PlatformSipConfig> {
  return resolvePlatformSipConfig();
}

export function platformSipConfigStatus(): { configured: boolean; missing: string[] } {
  const telnyxConfigured = Boolean(process.env.TELNYX_API_KEY?.trim());
  const explicitAddress = Boolean(process.env.ELEVENLABS_SIP_OUTBOUND_ADDRESS?.trim());
  const explicitCreds = Boolean(
    process.env.ELEVENLABS_SIP_USERNAME?.trim() && process.env.ELEVENLABS_SIP_PASSWORD?.trim()
  );
  if (!explicitAddress && !telnyxConfigured) {
    return { configured: false, missing: ["ELEVENLABS_SIP_OUTBOUND_ADDRESS o TELNYX_API_KEY"] };
  }
  if (!explicitCreds && !telnyxConfigured) {
    return { configured: false, missing: ["ELEVENLABS_SIP_USERNAME/PASSWORD o TELNYX_API_KEY"] };
  }
  return { configured: true, missing: [] };
}

/** Mensaje legible para errores SIP comunes de ElevenLabs. */
export function describeElevenLabsSipError(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes("no username or password") || lower.includes("required auth")) {
    return "Telnyx exige usuario/contraseña SIP — reasigna la línea en Canales tras configurar credenciales.";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "Telnyx rechazó la llamada SIP — verifica perfil saliente y destino permitido (CO/US).";
  }
  return reason;
}
