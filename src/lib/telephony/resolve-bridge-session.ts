import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import { takePendingBridgeSession, type PendingBridgeSession } from "@/lib/telephony/bridge-session-store";
import { getPhoneTestCallSession } from "@/lib/telephony/test-call-session";

/** Resuelve sesión del puente Gemini — memoria primero, BD como respaldo. */
export async function resolveBridgeSession(callControlId: string): Promise<PendingBridgeSession | null> {
  const fromMemory = takePendingBridgeSession(callControlId);
  if (fromMemory) return fromMemory;

  const session = await getPhoneTestCallSession(callControlId);
  if (!session?.metadata.phone_number_id || !session.metadata.test_number_id) {
    return null;
  }

  const agent = await loadVoiceAgentForCall(session.voice_agent_id, session.user_id);
  if (!agent) return null;

  return {
    callControlId,
    callRecordId: session.id,
    userId: session.user_id,
    voiceAgentId: session.voice_agent_id,
    from: session.metadata.from,
    to: session.metadata.to,
    agentName: agent.agentName,
    config: agent.config,
    companyContextText: agent.companyContextText,
    preparedAt: Date.now()
  };
}
