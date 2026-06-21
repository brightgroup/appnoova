import { NextRequest, NextResponse } from "next/server";
import { getElevenLabsApiKey } from "@/lib/elevenlabs/config";
import { resolveElevenLabsPhoneLine } from "@/lib/elevenlabs/phone-line";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — línea remitente premium del agente (desde phone_numbers). ?agent_id= requerido */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!getElevenLabsApiKey()) {
    return NextResponse.json({
      configured: false,
      error: "Voz premium no disponible",
    });
  }

  const agentId = new URL(req.url).searchParams.get("agent_id");
  if (!agentId) {
    return NextResponse.json({ error: "agent_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select(
      "id, e164, friendly_name, elevenlabs_phone_number_id, elevenlabs_sync_error, elevenlabs_synced_at"
    )
    .eq("user_id", userId)
    .eq("voice_agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  if (!phone) {
    return NextResponse.json({
      configured: false,
      e164: null,
      label: null,
      sync_error: "Sin línea asignada — ve a Canales y asigna una línea Telnyx",
    });
  }

  const { data: agent } = await db
    .from("voice_agents")
    .select("elevenlabs_agent_id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  const line = await resolveElevenLabsPhoneLine(phone, {
    elevenlabsAgentId: agent?.elevenlabs_agent_id,
  });

  return NextResponse.json({
    configured: line.configured,
    phoneNumberId: line.phoneNumberId,
    e164: line.e164,
    label: line.label,
    sync_error: line.syncError ?? null,
    synced_at: line.syncedAt ?? null,
  });
}
