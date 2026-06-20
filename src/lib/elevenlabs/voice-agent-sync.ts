import type { SupabaseClient } from "@supabase/supabase-js";
import { syncElevenLabsAgent } from "@/lib/elevenlabs/sync-agent";
import type { VoiceAgentFormData } from "@/types/voice-agent";

export async function resolveCompanyNameForAgent(
  db: SupabaseClient,
  userId: string,
  companyContextId?: string | null
): Promise<string> {
  if (!companyContextId) return "Mi empresa";
  const { data } = await db
    .from("company_contexts")
    .select("name")
    .eq("id", companyContextId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.name?.trim() || "Mi empresa";
}

export async function syncVoiceAgentToElevenLabs(
  db: SupabaseClient,
  userId: string,
  form: VoiceAgentFormData,
  existingAgentId?: string | null
): Promise<{ elevenlabs_agent_id: string; elevenlabs_voice_id: string }> {
  const companyName = await resolveCompanyNameForAgent(db, userId, form.company_context_id);
  const result = await syncElevenLabsAgent({
    name: form.name,
    prompt: form.prompt,
    purposeId: form.source_template,
    elevenlabsVoiceId: form.elevenlabs_voice_id,
    temperature: form.temperature,
    existingAgentId: existingAgentId ?? form.elevenlabs_agent_id,
    companyName,
  });
  return { elevenlabs_agent_id: result.agentId, elevenlabs_voice_id: result.voiceId };
}
