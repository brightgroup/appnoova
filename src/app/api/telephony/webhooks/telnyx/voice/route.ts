import { NextRequest, NextResponse } from "next/server";
import {
  agentGreeting,
  logPhoneTestCall,
  resolveAgentLine,
  resolveOutboundTest
} from "@/lib/telephony/phone-call";
import { answerAndSpeak, speakText } from "@/lib/telephony/telnyx-call-control";

function isOutbound(direction: string): boolean {
  return direction === "outgoing" || direction === "outbound";
}

/** Webhook Telnyx Call Control — inbound y outbound de prueba. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data = body.data ?? body;
  const eventType = data?.event_type ?? "";
  const payload = data?.payload ?? {};
  const to = String(payload.to ?? payload.called_number ?? "");
  const from = String(payload.from ?? payload.caller_number ?? "");
  const callId = String(payload.call_control_id ?? data?.id ?? "");
  const direction = String(payload.direction ?? "");

  console.info("[telnyx:voice]", { eventType, from, to, callId, direction });

  if (!callId) return NextResponse.json({ ok: true });

  // Outbound de prueba: remitente (línea Telnyx) → destinatario (número de prueba)
  if (eventType === "call.answered" && isOutbound(direction)) {
    const ctx = await resolveOutboundTest(from, to);
    if (ctx?.agent) {
      const greeting = agentGreeting(ctx.agent.name, ctx.agent.prompt);
      try {
        await speakText(callId, greeting);
      } catch (e) {
        console.error("[telnyx:voice] outbound speak error:", e);
      }
      await logPhoneTestCall(ctx, {
        direction: "outbound",
        counterpartyE164: ctx.destinationE164,
        isTest: true,
        meta: { telnyx_call_id: callId, event_type: eventType }
      });
    }
  }

  // Inbound: alguien llama a la línea del agente
  if (eventType === "call.initiated" && !isOutbound(direction) && to) {
    const inboundCtx = await resolveAgentLine(to);
    if (inboundCtx?.agent) {
      const greeting = agentGreeting(inboundCtx.agent.name, inboundCtx.agent.prompt);
      try {
        await answerAndSpeak(callId, greeting);
      } catch (e) {
        console.error("[telnyx:voice] inbound answer/speak error:", e);
      }
      await logPhoneTestCall(inboundCtx, {
        direction: "inbound",
        counterpartyE164: from || "Desconocido",
        isTest: false,
        meta: { telnyx_call_id: callId, event_type: eventType }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
