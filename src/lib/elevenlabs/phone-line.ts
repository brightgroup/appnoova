import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";

export interface ElevenLabsPhoneLineInfo {
  configured: boolean;
  phoneNumberId: string | null;
  e164: string | null;
  label: string | null;
}

/** Línea saliente premium (SIP ElevenLabs) — equivalente al remitente Telnyx en Google Live. */
export async function getElevenLabsPhoneLineInfo(): Promise<ElevenLabsPhoneLineInfo> {
  const phoneNumberId = getElevenLabsPhoneNumberId();
  if (!phoneNumberId) {
    return {
      configured: false,
      phoneNumberId: null,
      e164: null,
      label: null,
    };
  }

  try {
    const data = await elevenLabsFetch<{
      phone_number?: string;
      label?: string;
    }>(`/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`);

    return {
      configured: Boolean(data.phone_number?.trim()),
      phoneNumberId,
      e164: data.phone_number?.trim() || null,
      label: data.label?.trim() || "Línea premium",
    };
  } catch {
    return {
      configured: true,
      phoneNumberId,
      e164: null,
      label: "Línea premium",
    };
  }
}
