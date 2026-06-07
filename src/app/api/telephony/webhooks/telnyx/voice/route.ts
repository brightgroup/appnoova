import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";

/** Webhook Telnyx Call Control — placeholder MVP. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data = body.data ?? body;
  const eventType = data?.event_type ?? "";
  const payload = data?.payload ?? {};
  const to = payload.to ?? payload.called_number ?? "";
  const from = payload.from ?? payload.caller_number ?? "";
  const callId = payload.call_control_id ?? data?.id ?? "";

  console.info("[telnyx:voice]", { eventType, from, to, callId });

  if (eventType === "call.initiated" && to) {
    const db = adminClient();
    const e164 = String(to).startsWith("+") ? String(to) : `+${String(to).replace(/\D/g, "")}`;
    const { data: phone } = await db
      .from("phone_numbers")
      .select("id, user_id, voice_agent_id")
      .eq("e164", e164)
      .eq("status", "active")
      .maybeSingle();

    if (phone?.voice_agent_id) {
      await db.from("voice_agent_calls").insert({
        user_id: phone.user_id,
        voice_agent_id: phone.voice_agent_id,
        phone_number: from ? String(from) : "Desconocido",
        status: "missed",
        status_label: "Inbound - Pendiente conectar agente IA",
        summary: "Llamada entrante Telnyx. Conecta Vapi/Retell para atender.",
        metadata: { telnyx_call_id: callId, direction: "inbound", to: e164 }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
