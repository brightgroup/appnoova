import { NextRequest, NextResponse } from "next/server";
import { billingBlockedMessage, checkBillingForUser } from "@/lib/billing/meter";
import {
  PREMIUM_USER_MESSAGES,
  describePremiumErrorMessage,
  isQuotaOrBillingError,
  logPremiumInternalIssue,
} from "@/lib/elevenlabs/disconnect-label";
import { getElevenLabsApiKey } from "@/lib/elevenlabs/config";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { getElevenLabsWebSessionCredentials } from "@/lib/elevenlabs/session-credentials";
import { checkElevenLabsAgentHealth } from "@/lib/elevenlabs/provider-health";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — credenciales de sesión web (WebRTC) para agente premium del usuario. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!getElevenLabsApiKey()) {
    logPremiumInternalIssue("session_config", { reason: "missing_api_key" });
    return NextResponse.json(
      { error: PREMIUM_USER_MESSAGES.temporarilyUnavailable, code: "premium_unavailable" },
      { status: 503 }
    );
  }

  const voiceAgentId = req.nextUrl.searchParams.get("voice_agent_id")?.trim();
  if (!voiceAgentId) {
    return NextResponse.json({ error: "voice_agent_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      { error: billingBlockedMessage(billing.reason), code: billing.reason },
      { status: 402 }
    );
  }

  const { data: agent, error } = await db
    .from("voice_agents")
    .select("id, voice_provider, elevenlabs_agent_id")
    .eq("id", voiceAgentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  if (agent.voice_provider !== "elevenlabs") {
    return NextResponse.json({ error: "Este agente no es premium" }, { status: 400 });
  }
  if (!agent.elevenlabs_agent_id) {
    return NextResponse.json({ error: "Guarda el agente antes de probarlo" }, { status: 400 });
  }

  try {
    const health = await checkElevenLabsAgentHealth(agent.elevenlabs_agent_id);
    if (!health.ok) {
      return NextResponse.json(
        {
          error: PREMIUM_USER_MESSAGES.temporarilyUnavailable,
          code: "premium_unavailable",
        },
        { status: 503 }
      );
    }

    const creds = await getElevenLabsWebSessionCredentials(agent.elevenlabs_agent_id);
    const temporal = buildColombiaTemporalContext();
    return NextResponse.json({
      ...creds,
      connectionType: "webrtc",
      dynamicVariables: temporal.dynamicVariables,
    });
  } catch (e) {
    const internal = e instanceof Error ? e.message : "session_start_failed";
    logPremiumInternalIssue("session_credentials", {
      voiceAgentId,
      elevenlabsAgentId: agent.elevenlabs_agent_id,
      error: internal,
    });
    const userError = isQuotaOrBillingError(internal)
      ? PREMIUM_USER_MESSAGES.temporarilyUnavailable
      : describePremiumErrorMessage(internal);
    return NextResponse.json({ error: userError, code: "premium_unavailable" }, { status: 503 });
  }
}
