import { NextRequest, NextResponse } from "next/server";
import { agentGreeting, logPhoneTestCall, resolveAgentLine } from "@/lib/telephony/phone-call";

/** Webhook Twilio — llamada entrante al agente asignado. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const called = String(form.get("Called") ?? form.get("To") ?? "");
  const caller = String(form.get("From") ?? "");
  const callSid = String(form.get("CallSid") ?? "");

  const ctx = await resolveAgentLine(called);

  if (ctx?.agent) {
    const greeting = agentGreeting(ctx.agent.name, ctx.agent.prompt);
    await logPhoneTestCall(ctx, {
      direction: "inbound",
      counterpartyE164: caller || "Desconocido",
      isTest: false,
      meta: { twilio_call_sid: callSid }
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-CO" voice="Polly.Lupe">${escapeXml(greeting)}</Say>
  <Pause length="2"/>
  <Say language="es-CO" voice="Polly.Lupe">Gracias por probar tu agente con Noova. Hasta pronto.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" }
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-CO" voice="Polly.Lupe">
    Esta línea no tiene un agente asignado. Configura tu agente en el panel de Noova.
  </Say>
  <Hangup/>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" }
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
