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

/** Credenciales SIP plataforma (Telnyx ↔ ElevenLabs) — una sola vez en env. */
export function getPlatformSipConfig(): PlatformSipConfig | null {
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
    username: process.env.ELEVENLABS_SIP_USERNAME?.trim() || null,
    password: process.env.ELEVENLABS_SIP_PASSWORD?.trim() || null,
    inboundAllowedAddresses: parseCsv(process.env.ELEVENLABS_SIP_INBOUND_ALLOWED_ADDRESSES),
  };
}

export function requirePlatformSipConfig(): PlatformSipConfig {
  const cfg = getPlatformSipConfig();
  if (!cfg) {
    throw new Error(
      "SIP premium no configurado — define ELEVENLABS_SIP_OUTBOUND_ADDRESS (y credenciales Telnyx si aplica)"
    );
  }
  return cfg;
}

export function platformSipConfigStatus(): { configured: boolean; missing: string[] } {
  const telnyxConfigured = Boolean(process.env.TELNYX_API_KEY?.trim());
  const explicitAddress = Boolean(process.env.ELEVENLABS_SIP_OUTBOUND_ADDRESS?.trim());
  if (!explicitAddress && !telnyxConfigured) {
    return { configured: false, missing: ["ELEVENLABS_SIP_OUTBOUND_ADDRESS o TELNYX_API_KEY"] };
  }
  return { configured: true, missing: [] };
}
