import { syncElevenLabsPhoneLine } from "@/lib/elevenlabs/import-phone-line";
import { getElevenLabsApiKey } from "@/lib/elevenlabs/config";
import { platformSipConfigStatus } from "@/lib/elevenlabs/sip-config";

interface PremiumAgentRow {
  voice_provider: string;
  elevenlabs_agent_id: string | null;
}

interface PhoneRow {
  id: string;
  e164: string;
  friendly_name: string | null;
  elevenlabs_phone_number_id: string | null;
}

/** Sincroniza línea Telnyx → ElevenLabs al asignar a agente premium. */
export async function syncPhoneLineForPremiumAgent(
  phone: PhoneRow,
  agent: PremiumAgentRow
): Promise<{ elevenlabs_phone_number_id: string | null; elevenlabs_sync_error: string | null; elevenlabs_synced_at: string | null }> {
  if (agent.voice_provider !== "elevenlabs") {
    return {
      elevenlabs_phone_number_id: phone.elevenlabs_phone_number_id,
      elevenlabs_sync_error: null,
      elevenlabs_synced_at: null,
    };
  }

  if (!getElevenLabsApiKey()) {
    throw new Error("Voz premium no disponible — ELEVENLABS_API_KEY no configurado");
  }

  const sip = platformSipConfigStatus();
  if (!sip.configured) {
    throw new Error(
      `SIP premium no configurado en el servidor (${sip.missing.join(", ")}). Contacta a soporte Noova.`
    );
  }

  if (!agent.elevenlabs_agent_id) {
    throw new Error("Guarda la configuración del agente premium antes de asignar la línea");
  }

  const result = await syncElevenLabsPhoneLine({
    e164: phone.e164,
    label: phone.friendly_name,
    existingPhoneNumberId: phone.elevenlabs_phone_number_id,
    elevenlabsAgentId: agent.elevenlabs_agent_id,
  });

  return {
    elevenlabs_phone_number_id: result.phoneNumberId,
    elevenlabs_sync_error: null,
    elevenlabs_synced_at: new Date().toISOString(),
  };
}
