import { resolveCompanyDisplayName } from "@/lib/company-context-resolve";
import { adminClient } from "@/lib/voice-agents-server";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import type { VoiceAgentFormData } from "@/types/voice-agent";

export interface LoadedVoiceAgent {
  config: VoiceAgentFormData;
  companyContextText: string;
  companyName: string;
  agentName: string;
  callsCount: number;
}

export async function loadVoiceAgentForCall(
  voiceAgentId: string,
  userId: string
): Promise<LoadedVoiceAgent | null> {
  const db = adminClient();
  const { data: agent, error } = await db
    .from("voice_agents")
    .select("*")
    .eq("id", voiceAgentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !agent) return null;

  let companyContextText = "";
  let companyName = resolveCompanyDisplayName(null);
  if (agent.company_context_id) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("name, content")
      .eq("id", agent.company_context_id)
      .eq("user_id", userId)
      .maybeSingle();
    companyContextText = ctx?.content?.trim() ?? "";
    companyName = resolveCompanyDisplayName(ctx?.name);
  }

  return {
    config: normalizeVoiceAgentForm(agent),
    companyContextText,
    companyName,
    agentName: agent.name,
    callsCount: Number(agent.calls_count) || 0
  };
}
