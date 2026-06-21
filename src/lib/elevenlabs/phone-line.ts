import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";
import { syncElevenLabsPhoneLine } from "@/lib/elevenlabs/import-phone-line";
import { resolvePlatformSipConfig } from "@/lib/elevenlabs/sip-config";

export interface ElevenLabsPhoneLineInfo {
  configured: boolean;
  phoneNumberId: string | null;
  e164: string | null;
  label: string | null;
  syncError?: string | null;
  syncedAt?: string | null;
}

export interface PhoneNumberElevenLabsRow {
  id: string;
  e164: string;
  friendly_name: string | null;
  elevenlabs_phone_number_id?: string | null;
  elevenlabs_sync_error?: string | null;
  elevenlabs_synced_at?: string | null;
}

/** Línea saliente premium desde phone_numbers (o fallback env global). */
export async function resolveElevenLabsPhoneLine(
  phone: PhoneNumberElevenLabsRow,
  options?: { elevenlabsAgentId?: string | null; resync?: boolean }
): Promise<ElevenLabsPhoneLineInfo> {
  let phoneNumberId = phone.elevenlabs_phone_number_id?.trim() || null;
  let syncError = phone.elevenlabs_sync_error ?? null;
  let syncedAt = phone.elevenlabs_synced_at ?? null;

  if ((!phoneNumberId || options?.resync)) {
    try {
      await resolvePlatformSipConfig();
      const result = await syncElevenLabsPhoneLine({
        e164: phone.e164,
        label: phone.friendly_name,
        existingPhoneNumberId: phoneNumberId,
        elevenlabsAgentId: options?.elevenlabsAgentId,
      });
      phoneNumberId = result.phoneNumberId;
      syncError = null;
      syncedAt = new Date().toISOString();
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Error al sincronizar línea premium";
    }
  }

  if (!phoneNumberId) {
    phoneNumberId = getElevenLabsPhoneNumberId();
  }

  if (!phoneNumberId) {
    return {
      configured: false,
      phoneNumberId: null,
      e164: phone.e164,
      label: phone.friendly_name,
      syncError: syncError ?? "Línea premium sin sincronizar — asigna la línea en Canales",
      syncedAt,
    };
  }

  try {
    const data = await elevenLabsFetch<{
      phone_number?: string;
      label?: string;
    }>(`/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`);

    return {
      configured: true,
      phoneNumberId,
      e164: data.phone_number?.trim() || phone.e164,
      label: data.label?.trim() || phone.friendly_name || "Línea premium",
      syncError,
      syncedAt,
    };
  } catch {
    return {
      configured: true,
      phoneNumberId,
      e164: phone.e164,
      label: phone.friendly_name || "Línea premium",
      syncError,
      syncedAt,
    };
  }
}

/** @deprecated Usar resolveElevenLabsPhoneLine con phone_numbers */
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

/** Lista números importados en ElevenLabs (diagnóstico). */
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
