import { NextRequest, NextResponse } from "next/server";
import {
  getElevenLabsConversation,
  mapElevenLabsStatusToPhase,
} from "@/lib/elevenlabs/outbound-call";
import { finalizeElevenLabsPremiumCall } from "@/lib/elevenlabs/finalize-premium-call";
import { describeElevenLabsSipError } from "@/lib/elevenlabs/sip-config";
import {
  computeConnectedDuration,
  getPhoneTestCallSession,
  labelForPhase,
  updatePhoneTestCallSession,
} from "@/lib/telephony/test-call-session";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — estado de llamada premium ElevenLabs (polling desde PhoneTestPanel). */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversation_id")?.trim()
    || req.nextUrl.searchParams.get("call_control_id")?.trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const session = await getPhoneTestCallSession(conversationId);
  if (!session || session.user_id !== userId) {
    return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
  }

  try {
    const conv = await getElevenLabsConversation(conversationId);
    const phase = mapElevenLabsStatusToPhase(conv.status);
    const sipError = conv.errorReason
      ? describeElevenLabsSipError(conv.errorReason)
      : undefined;

    if (phase === "connected" && !session.metadata.answered_at) {
      await updatePhoneTestCallSession(conversationId, {
        phase: "connected",
        status_label: "Prueba premium - En llamada",
        last_event: "elevenlabs.in-progress",
      });
    }

    if (phase === "ended" || phase === "failed") {
      if (!session.metadata.finalized) {
        if (phase === "failed" && conv.callDurationSecs <= 0 && !conv.voicemailDetected) {
          const db = adminClient();
          await db
            .from("voice_agent_calls")
            .update({
              duration_sec: 0,
              credits: 0,
              status: "missed",
              status_label: "No contestada",
              in_voicemail: false,
              disconnect_reason: sipError ?? conv.terminationReason ?? "No contestada",
              summary: `Llamada a ${session.metadata.to} — no contestada.`,
              metadata: {
                ...session.metadata,
                finalized: true,
                outcome: "no_answer",
              },
            })
            .eq("id", session.id);
        } else {
          await finalizeElevenLabsPremiumCall({
            conversationId,
            durationSec: conv.callDurationSecs,
            transcript: conv.transcript,
            disconnectReason: sipError ?? conv.terminationReason ?? conv.status,
          });
        }
      }
    } else {
      await updatePhoneTestCallSession(conversationId, {
        phase: phase === "connected" ? "connected" : phase,
        status_label: phase === "connected" ? "Prueba premium - En llamada" : labelForPhase(phase).replace("telefónica", "premium"),
        last_event: `elevenlabs.${conv.status}`,
        ...(sipError ? { error: sipError } : {}),
      });
    }

    const refreshed = await getPhoneTestCallSession(conversationId);
    const meta = refreshed?.metadata ?? session.metadata;
    const durationSec =
      conv.callDurationSecs > 0 ? conv.callDurationSecs : computeConnectedDuration(meta);

    const displayPhase = meta.finalized ? "ended" : phase;
    const callError = sipError ?? meta.error;

    return NextResponse.json({
      phase: displayPhase === "failed" || (displayPhase === "ended" && callError) ? "failed" : displayPhase,
      status_label: callError
        ? "Prueba premium - Error"
        : refreshed?.status_label ?? labelForPhase(phase),
      duration_sec: durationSec,
      error: callError,
      provider: "elevenlabs",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al consultar llamada";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST — finaliza manualmente (idempotente). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? body.call_control_id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const session = await getPhoneTestCallSession(conversationId);
  if (!session || session.user_id !== userId) {
    return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
  }

  if (!session.metadata.finalized) {
    await finalizeElevenLabsPremiumCall({ conversationId });
  }

  return NextResponse.json({ success: true, finalized: true });
}
