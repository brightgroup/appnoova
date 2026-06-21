import { NextRequest, NextResponse } from "next/server";
import {
  syncPhoneLineForPremiumAgent,
} from "@/lib/elevenlabs/phone-line-sync";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

const SELECT_FIELDS =
  "id, e164, friendly_name, country_code, number_type, status, voice_agent_id, capabilities, assigned_at, elevenlabs_phone_number_id, elevenlabs_sync_error, elevenlabs_synced_at";

/** GET — números del usuario autenticado. ?agent_id= opcional */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get("agent_id");
  const db = adminClient();

  let query = db
    .from("phone_numbers")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false });

  if (agentId) query = query.eq("voice_agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ phone_numbers: data ?? [] });
}

/** PATCH — asignar o desvincular agente. Body: { id, voice_agent_id } */
export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { id, voice_agent_id } = body as { id?: string; voice_agent_id?: string | null };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = adminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!phone || phone.status !== "active") {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }

  let agent: {
    id: string;
    voice_provider: string;
    elevenlabs_agent_id: string | null;
  } | null = null;

  if (voice_agent_id) {
    const { data: agentRow } = await db
      .from("voice_agents")
      .select("id, voice_provider, elevenlabs_agent_id")
      .eq("id", voice_agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!agentRow) {
      return NextResponse.json({ error: "Agente no válido" }, { status: 400 });
    }
    agent = agentRow;

    await db
      .from("phone_numbers")
      .update({ voice_agent_id: null, updated_at: new Date().toISOString() })
      .eq("voice_agent_id", voice_agent_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("id", id);
  }

  let elevenlabsFields: {
    elevenlabs_phone_number_id?: string | null;
    elevenlabs_sync_error?: string | null;
    elevenlabs_synced_at?: string | null;
  } = {};

  if (agent?.voice_provider === "elevenlabs") {
    try {
      const synced = await syncPhoneLineForPremiumAgent(
        {
          id: phone.id,
          e164: phone.e164,
          friendly_name: phone.friendly_name,
          elevenlabs_phone_number_id: phone.elevenlabs_phone_number_id,
        },
        agent
      );
      elevenlabsFields = synced;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al sincronizar línea premium";
      elevenlabsFields = {
        elevenlabs_sync_error: message,
      };
      return NextResponse.json({ error: message, code: "premium_line_sync_failed" }, { status: 502 });
    }
  }

  const { data, error } = await db
    .from("phone_numbers")
    .update({
      voice_agent_id: voice_agent_id ?? null,
      ...elevenlabsFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ phone_number: data });
}
