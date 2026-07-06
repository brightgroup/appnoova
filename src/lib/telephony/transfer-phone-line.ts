import { adminClient } from "@/lib/voice-agents-server";
import { syncElevenLabsPhoneLine } from "@/lib/elevenlabs/import-phone-line";
import { resolvePlatformSipConfig } from "@/lib/elevenlabs/sip-config";
import type { PhoneNumberRecord } from "@/types/phone-number";

type Db = ReturnType<typeof adminClient>;

export async function transferPhoneLineToUser(input: {
  db: Db;
  phoneId: string;
  targetUserId: string;
  voiceAgentId?: string | null;
  assignedBy?: string | null;
}): Promise<PhoneNumberRecord> {
  const { db, phoneId, targetUserId, assignedBy } = input;

  const { data: phone, error: phoneErr } = await db
    .from("phone_numbers")
    .select("*")
    .eq("id", phoneId)
    .eq("status", "active")
    .maybeSingle();

  if (phoneErr) throw new Error(phoneErr.message);
  if (!phone) throw new Error("Número no encontrado");

  const { data: targetUser } = await db.from("users").select("id").eq("id", targetUserId).maybeSingle();
  if (!targetUser) throw new Error("Usuario destino no encontrado");

  let voiceAgentId = input.voiceAgentId ?? phone.voice_agent_id;

  if (voiceAgentId) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("id, voice_provider, elevenlabs_agent_id")
      .eq("id", voiceAgentId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!agent) throw new Error("El agente no pertenece al usuario destino");
  } else if (targetUserId !== phone.user_id) {
    voiceAgentId = null;
  }

  if (voiceAgentId) {
    await db
      .from("phone_numbers")
      .update({ voice_agent_id: null, updated_at: new Date().toISOString() })
      .eq("voice_agent_id", voiceAgentId)
      .eq("status", "active")
      .neq("id", phoneId);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    user_id: targetUserId,
    voice_agent_id: voiceAgentId ?? null,
    assigned_by: assignedBy ?? null,
    assigned_at: now,
    updated_at: now,
  };

  const { data: updated, error: updateErr } = await db
    .from("phone_numbers")
    .update(patch)
    .eq("id", phoneId)
    .select("*")
    .single();

  if (updateErr) throw new Error(updateErr.message);

  if (voiceAgentId) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("voice_provider, elevenlabs_agent_id")
      .eq("id", voiceAgentId)
      .maybeSingle();

    if (agent?.voice_provider === "elevenlabs" && agent.elevenlabs_agent_id) {
      try {
        await resolvePlatformSipConfig();
        const result = await syncElevenLabsPhoneLine({
          e164: updated.e164,
          label: updated.friendly_name,
          existingPhoneNumberId: updated.elevenlabs_phone_number_id,
          elevenlabsAgentId: agent.elevenlabs_agent_id,
        });
        await db
          .from("phone_numbers")
          .update({
            elevenlabs_phone_number_id: result.phoneNumberId,
            elevenlabs_sync_error: null,
            elevenlabs_synced_at: now,
            updated_at: now,
          })
          .eq("id", phoneId);
        updated.elevenlabs_phone_number_id = result.phoneNumberId;
        updated.elevenlabs_sync_error = null;
        updated.elevenlabs_synced_at = now;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al sincronizar ElevenLabs";
        await db
          .from("phone_numbers")
          .update({
            elevenlabs_sync_error: message,
            updated_at: now,
          })
          .eq("id", phoneId);
        updated.elevenlabs_sync_error = message;
      }
    }
  }

  return updated as PhoneNumberRecord;
}
