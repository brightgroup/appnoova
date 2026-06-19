import type { VoiceAgentFormData } from "@/types/voice-agent";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import { resolvePurposeId, getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { generateAgentPrompt } from "@/lib/agent-prompt-generator";
import {
  suggestTemperatureForPurpose,
  suggestVoiceForPurpose,
} from "@/lib/voice-accent-profile";

export interface VoiceTemplateMeta {
  name: string;
  prompt: string;
  color: string;
  tag: "Inbound" | "Outbound";
  description: string;
  voice_name: string;
  temperature: number;
}

function buildMeta(purposeId: string): VoiceTemplateMeta {
  const purpose = getPurposeMeta("voice", purposeId);
  const prompt = generateAgentPrompt({
    channel: "voice",
    agentName: "Asistente",
    purposeId,
    companyName: "Mi empresa",
    companyDescription: "",
    language: "es",
  });
  return {
    name: purpose.label,
    color: purpose.color,
    tag: purpose.tag === "Web" ? "Inbound" : purpose.tag,
    description: purpose.description,
    prompt,
    voice_name: suggestVoiceForPurpose(purposeId),
    temperature: suggestTemperatureForPurpose(purposeId),
  };
}

export const VOICE_AGENT_TEMPLATES: Record<string, VoiceTemplateMeta> = Object.fromEntries(
  [
    "lead-qualification",
    "policy-reminder",
    "follow-up",
    "customer-service",
    "meeting-scheduling",
  ].map(id => [id, buildMeta(id)])
);

export function resolveBaseTemplateId(templateId: string): string {
  return resolvePurposeId("voice", templateId);
}

export function getTemplateDefaults(templateId: string): VoiceAgentFormData {
  const base = resolveBaseTemplateId(templateId);
  const t = VOICE_AGENT_TEMPLATES[base] ?? buildMeta("lead-qualification");
  return {
    source_template: base,
    name: t.name,
    prompt: t.prompt,
    voice_name: t.voice_name,
    model: DEFAULT_LIVE_MODEL,
    voice_speed: 1.0,
    temperature: t.temperature,
    volume: 1.0,
    llm_model: DEFAULT_LIVE_MODEL,
    color: t.color,
  };
}

export function getTemplateMeta(templateId: string): VoiceTemplateMeta {
  const base = resolveBaseTemplateId(templateId);
  return VOICE_AGENT_TEMPLATES[base] ?? buildMeta("lead-qualification");
}
