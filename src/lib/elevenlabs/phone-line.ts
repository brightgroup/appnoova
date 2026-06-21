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

    const e164 = data.phone_number?.trim() || null;
    return {
      configured: true,
      phoneNumberId,
      e164,
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

/** Lista números importados en ElevenLabs (diagnóstico / setup). */
export async function listElevenLabsPhoneNumbers(): Promise<
  { phone_number_id: string; phone_number: string; label: string }[]
> {
  try {
    const data = await elevenLabsFetch<
      { phone_number_id?: string; phone_number?: string; label?: string }[]
    >("/convai/phone-numbers");
    return (data ?? [])
      .filter(row => row.phone_number_id && row.phone_number)
      .map(row => ({
        phone_number_id: String(row.phone_number_id),
        phone_number: String(row.phone_number),
        label: String(row.label ?? "Línea premium"),
      }));
  } catch {
    return [];
  }
}
