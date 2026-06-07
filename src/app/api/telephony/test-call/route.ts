import { NextRequest, NextResponse } from "next/server";
import { telnyxPlaceCall } from "@/lib/telephony/telnyx-call-control";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** POST — llamada saliente de prueba: remitente (línea Telnyx) → destinatario (número de prueba). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { voice_agent_id, phone_number_id, test_number_id } = body as {
    voice_agent_id?: string;
    phone_number_id?: string;
    test_number_id?: string;
  };

  if (!voice_agent_id || !phone_number_id || !test_number_id) {
    return NextResponse.json({ error: "voice_agent_id, phone_number_id y test_number_id requeridos" }, { status: 400 });
  }

  const db = adminClient();

  const [{ data: phone }, { data: test }, { data: agent }] = await Promise.all([
    db
      .from("phone_numbers")
      .select("*")
      .eq("id", phone_number_id)
      .eq("user_id", userId)
      .eq("voice_agent_id", voice_agent_id)
      .eq("status", "active")
      .maybeSingle(),
    db
      .from("test_phone_numbers")
      .select("*")
      .eq("id", test_number_id)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("voice_agents")
      .select("id, name")
      .eq("id", voice_agent_id)
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (!phone) {
    return NextResponse.json({ error: "Línea remitente no asignada a este agente" }, { status: 400 });
  }
  if (!test) {
    return NextResponse.json({ error: "Número destinatario no encontrado" }, { status: 400 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })?.telnyx;
  const connectionId =
    telnyx?.connection_id ||
    telnyx?.call_control_app_id ||
    process.env.TELNYX_CONNECTION_ID?.trim();

  if (!connectionId) {
    return NextResponse.json({ error: "TELNYX_CONNECTION_ID no configurado" }, { status: 503 });
  }

  try {
    const { callControlId } = await telnyxPlaceCall({
      connectionId,
      from: phone.e164,
      to: test.e164
    });

    return NextResponse.json({
      success: true,
      call_control_id: callControlId,
      from: phone.e164,
      to: test.e164,
      agent_name: agent.name
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al marcar";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
