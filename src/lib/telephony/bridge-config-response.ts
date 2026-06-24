import { buildPhoneAgentSystemInstruction } from "@/lib/telephony/phone-agent-instruction";
import { buildVoiceKickoffMessage } from "@/lib/voice-accent-profile";
import { peekPendingBridgeSession } from "@/lib/telephony/bridge-session-store";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import { getPhoneTestCallSession } from "@/lib/telephony/test-call-session";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import { geminiLiveTemperature } from "@/lib/gemini-live-config";
import { geminiTemperature } from "@/lib/voice-agent-audio";

export interface BridgeConfigResponse {
  call_control_id: string;
  call_record_id: string;
  agent_name: string;
  model: string;
  voice_name: string;
  temperature: number;
  system_instruction: string;
  kickoff_message: string;
}

/** Config del agente para Pipecat (memoria primero, BD como respaldo). */
export async function getBridgeConfigForPipecat(
  callControlId: string
): Promise<BridgeConfigResponse | null> {
  const fromMemory = peekPendingBridgeSession(callControlId);
  if (fromMemory) {
    return {
      call_control_id: fromMemory.callControlId,
      call_record_id: fromMemory.callRecordId,
      agent_name: fromMemory.agentName,
      model: fromMemory.config.model || DEFAULT_LIVE_MODEL,
      voice_name: fromMemory.config.voice_name || "Aoede",
      temperature: geminiLiveTemperature(geminiTemperature(fromMemory.config.temperature)),
      system_instruction: buildPhoneAgentSystemInstruction(
        fromMemory.config.prompt,
        fromMemory.companyContextText,
        fromMemory.agentName,
        fromMemory.config.source_template,
        fromMemory.companyName
      ),
      kickoff_message: buildVoiceKickoffMessage(fromMemory.config.source_template, fromMemory.companyName),
    };
  }

  const session = await getPhoneTestCallSession(callControlId);
  if (!session) {
    return null;
  }

  const agent = await loadVoiceAgentForCall(session.voice_agent_id, session.user_id);
  if (!agent) return null;

  return {
    call_control_id: callControlId,
    call_record_id: session.id,
    agent_name: agent.agentName,
    model: agent.config.model || DEFAULT_LIVE_MODEL,
    voice_name: agent.config.voice_name || "Aoede",
    temperature: geminiLiveTemperature(geminiTemperature(agent.config.temperature)),
    system_instruction: buildPhoneAgentSystemInstruction(
      agent.config.prompt,
      agent.companyContextText,
      agent.agentName,
      agent.config.source_template,
      agent.companyName
    ),
    kickoff_message: buildVoiceKickoffMessage(agent.config.source_template, agent.companyName),
  };
}
