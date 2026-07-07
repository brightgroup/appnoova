import { resolveCompanyDisplayName } from "@/lib/company-context-resolve";
import { loadCompanyContextById } from "@/lib/company-context-load";
import { adminClient } from "@/lib/voice-agents-server";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import type { VoiceAgentFormData } from "@/types/voice-agent";

export interface LoadedVoiceAgent {
  config: VoiceAgentFormData;
  companyContextText: string;
  companyName: string;
  agentName: string;
  organizationId: string | null;
  callsCount: number;
}

export async function loadVoiceAgentForCall(
  voiceAgentId: string,
  userId: string,
  organizationId?: string | null
): Promise<LoadedVoiceAgent | null> {
  const db = adminClient();
  let query = db.from("voice_agents").select("*").eq("id", voiceAgentId);
  const orgId = organizationId?.trim();
  if (orgId) {
    query = query.eq("organization_id", orgId);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data: agent, error } = await query.maybeSingle();

  if (error || !agent) return null;

  const ctx = await loadCompanyContextById(db, agent.company_context_id, {
    organizationId: agent.organization_id,
    userId,
  });

  return {
    config: normalizeVoiceAgentForm(agent),
    companyContextText: ctx.content,
    companyName: ctx.name,
    agentName: agent.name,
    organizationId: agent.organization_id ? String(agent.organization_id) : null,
    callsCount: Number(agent.calls_count) || 0,
  };
}
