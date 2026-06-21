import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { listElevenLabsPhoneNumbers } from "@/lib/elevenlabs/phone-line";
import { requirePlatformSipConfig, type PlatformSipConfig } from "@/lib/elevenlabs/sip-config";

export interface SyncElevenLabsPhoneLineInput {
  e164: string;
  label?: string | null;
  existingPhoneNumberId?: string | null;
  elevenlabsAgentId?: string | null;
}

export interface SyncElevenLabsPhoneLineResult {
  phoneNumberId: string;
  created: boolean;
}

function buildTrunkPayload(cfg: PlatformSipConfig) {
  const credentials =
    cfg.username
      ? { username: cfg.username, ...(cfg.password ? { password: cfg.password } : {}) }
      : undefined;

  const inbound =
    cfg.inboundAllowedAddresses.length > 0
      ? {
          allowed_addresses: cfg.inboundAllowedAddresses,
          media_encryption: cfg.mediaEncryption,
          ...(credentials ? { credentials } : {}),
        }
      : null;

  const outbound = {
    address: cfg.outboundAddress,
    transport: cfg.transport,
    media_encryption: cfg.mediaEncryption,
    ...(credentials ? { credentials } : {}),
  };

  return { inbound_trunk_config: inbound, outbound_trunk_config: outbound };
}

async function findElevenLabsPhoneNumberIdByE164(e164: string): Promise<string | null> {
  const numbers = await listElevenLabsPhoneNumbers();
  const normalized = e164.trim();
  const match = numbers.find(
    n => n.phone_number === normalized || n.phone_number.replace(/\s/g, "") === normalized
  );
  return match?.phone_number_id ?? null;
}

async function createElevenLabsPhoneNumber(
  input: SyncElevenLabsPhoneLineInput,
  cfg: PlatformSipConfig
): Promise<string> {
  const trunk = buildTrunkPayload(cfg);
  const data = await elevenLabsFetch<{ phone_number_id?: string }>("/convai/phone-numbers", {
    method: "POST",
    json: {
      provider: "sip_trunk",
      phone_number: input.e164,
      label: input.label?.trim() || input.e164,
      supports_inbound: true,
      supports_outbound: true,
      ...trunk,
    },
  });

  const id = data.phone_number_id?.trim();
  if (!id) throw new Error("ElevenLabs no devolvió phone_number_id al importar la línea");
  return id;
}

async function updateElevenLabsPhoneNumber(
  phoneNumberId: string,
  input: SyncElevenLabsPhoneLineInput,
  cfg: PlatformSipConfig
): Promise<void> {
  const trunk = buildTrunkPayload(cfg);
  await elevenLabsFetch(`/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
    method: "PATCH",
    json: {
      label: input.label?.trim() || input.e164,
      ...(input.elevenlabsAgentId ? { agent_id: input.elevenlabsAgentId } : {}),
      ...trunk,
    },
  });
}

/** Importa o actualiza una línea Telnyx en ElevenLabs y opcionalmente asigna el agente. */
export async function syncElevenLabsPhoneLine(
  input: SyncElevenLabsPhoneLineInput
): Promise<SyncElevenLabsPhoneLineResult> {
  const cfg = requirePlatformSipConfig();

  let phoneNumberId = input.existingPhoneNumberId?.trim() || null;
  let created = false;

  if (!phoneNumberId) {
    phoneNumberId = await findElevenLabsPhoneNumberIdByE164(input.e164);
  }

  if (!phoneNumberId) {
    phoneNumberId = await createElevenLabsPhoneNumber(input, cfg);
    created = true;
  }

  await updateElevenLabsPhoneNumber(phoneNumberId, input, cfg);

  return { phoneNumberId, created };
}
