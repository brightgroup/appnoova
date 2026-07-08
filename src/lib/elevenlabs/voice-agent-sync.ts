import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyContextById } from "@/lib/company-context-load";
import { syncElevenLabsAgent } from "@/lib/elevenlabs/sync-agent";
import type { VoiceAgentFormData } from "@/types/voice-agent";

export { resolveCompanyNameForAgent } from "@/lib/company-context-resolve";

export async function syncVoiceAgentToElevenLabs(
  db: SupabaseClient,
  userId: string,
  form: VoiceAgentFormData,
  existingAgentId?: string | null,
  organizationId?: string | null
): Promise<{ elevenlabs_agent_id: string; elevenlabs_voice_id: string }> {
  const ctx = await loadCompanyContextById(db, form.company_context_id, {
    organizationId,
    userId,
  });
  const result = await syncElevenLabsAgent({
    name: form.name,
    prompt: form.prompt,
    purposeId: form.source_template,
    elevenlabsVoiceId: form.elevenlabs_voice_id,
    temperature: form.temperature,
    existingAgentId: existingAgentId ?? form.elevenlabs_agent_id,
    companyName: ctx.name,
    companyContextText: ctx.content,
    llm: form.llm_model,
  });
  return { elevenlabs_agent_id: result.agentId, elevenlabs_voice_id: result.voiceId };
}
