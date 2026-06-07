import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Webhook Twilio — llamada entrante.
 * MVP: responde TwiML placeholder; fase 2 conectará Vapi/Retell o media bridge.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const called = String(form.get("Called") ?? form.get("To") ?? "");
  const caller = String(form.get("From") ?? "");
  const callSid = String(form.get("CallSid") ?? "");

  const db = adminClient();
  const e164 = called.startsWith("+") ? called : `+${called.replace(/\D/g, "")}`;

  const { data: phone } = await db
    .from("phone_numbers")
    .select("id, user_id, voice_agent_id, e164")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();

  if (phone?.voice_agent_id) {
    await db.from("voice_agent_calls").insert({
      user_id: phone.user_id,
      voice_agent_id: phone.voice_agent_id,
      phone_number: caller || "Desconocido",
      status: "missed",
      status_label: "Inbound - Pendiente conectar agente",
      summary: "Llamada entrante recibida. Conecta Vapi/Retell para atender automáticamente.",
      metadata: { twilio_call_sid: callSid, direction: "inbound", to: e164 }
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia">
    Gracias por llamar a Noova. Tu línea está activa. El agente de inteligencia artificial se conectará pronto.
  </Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" }
  });
}
