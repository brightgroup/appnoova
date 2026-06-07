import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — números del usuario autenticado. ?agent_id= opcional */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get("agent_id");
  const db = adminClient();

  let query = db
    .from("phone_numbers")
    .select("id, e164, friendly_name, country_code, number_type, status, voice_agent_id, capabilities, assigned_at")
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

  if (voice_agent_id) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("id")
      .eq("id", voice_agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agente no válido" }, { status: 400 });
    }
    await db
      .from("phone_numbers")
      .update({ voice_agent_id: null, updated_at: new Date().toISOString() })
      .eq("voice_agent_id", voice_agent_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("id", id);
  }

  const { data, error } = await db
    .from("phone_numbers")
    .update({ voice_agent_id: voice_agent_id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, e164, friendly_name, country_code, number_type, status, voice_agent_id, capabilities, assigned_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ phone_number: data });
}
