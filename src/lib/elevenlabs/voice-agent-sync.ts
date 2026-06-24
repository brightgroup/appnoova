import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCompanyDisplayName, resolveCompanyNameForAgent } from "@/lib/company-context-resolve";
import { syncElevenLabsAgent } from "@/lib/elevenlabs/sync-agent";
import type { VoiceAgentFormData } from "@/types/voice-agent";

export { resolveCompanyNameForAgent };

async function loadCompanyContextForAgent(
  db: SupabaseClient,
  userId: string,
  companyContextId?: string | null
): Promise<{ name: string; content: string }> {
  if (!companyContextId) {
    return { name: resolveCompanyDisplayName(null), content: "" };
  }
  const { data } = await db
    .from("company_contexts")
    .select("name, content")
    .eq("id", companyContextId)
    .eq("user_id", userId)
    .maybeSingle();
  return {
    name: resolveCompanyDisplayName(data?.name),
    content: data?.content?.trim() ?? "",
  };
}

export async function syncVoiceAgentToElevenLabs(
  db: SupabaseClient,
  userId: string,
  form: VoiceAgentFormData,
  existingAgentId?: string | null
): Promise<{ elevenlabs_agent_id: string; elevenlabs_voice_id: string }> {
  const ctx = await loadCompanyContextForAgent(db, userId, form.company_context_id);
  const result = await syncElevenLabsAgent({
    name: form.name,
    prompt: form.prompt,
    purposeId: form.source_template,
    elevenlabsVoiceId: form.elevenlabs_voice_id,
    temperature: form.temperature,
    existingAgentId: existingAgentId ?? form.elevenlabs_agent_id,
    companyName: ctx.name,
    companyContextText: ctx.content,
  });
  return { elevenlabs_agent_id: result.agentId, elevenlabs_voice_id: result.voiceId };
}
