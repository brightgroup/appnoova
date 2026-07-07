import type { TextAgentFormData } from "@/types/text-agent";
import { DEFAULT_TEXT_MODEL } from "@/lib/text-agent-options";
import { resolvePurposeId, getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { generateShortAgentPrompt } from "@/lib/agent-prompt-generator";

export interface TextTemplateMeta {
  name: string;
  prompt: string;
  color: string;
  tag: "Inbound" | "Outbound" | "Web";
  description: string;
}

function buildMeta(purposeId: string): TextTemplateMeta {
  const purpose = getPurposeMeta("text", purposeId);
  const prompt = generateShortAgentPrompt({
    channel: "text",
    agentName: purpose.label.split("–").pop()?.trim() || "Asistente",
    purposeId,
    companyName: "Mi empresa",
    companyDescription: "",
  });
  return {
    name: purpose.label,
    color: purpose.color,
    tag: purpose.tag,
    description: purpose.description,
    prompt,
  };
}

export const TEXT_AGENT_TEMPLATES: Record<string, TextTemplateMeta> = Object.fromEntries(
  [
    "lead-qualification",
    "sales-inquiries",
    "customer-assistant",
    "website-qa",
    "meeting-scheduling",
    "support-follow-up",
  ].map(id => [id, buildMeta(id)])
);

export function resolveBaseTextTemplateId(templateId: string): string {
  return resolvePurposeId("text", templateId);
}

export function getTextTemplateDefaults(templateId: string): TextAgentFormData {
  const base = resolveBaseTextTemplateId(templateId);
  const t = TEXT_AGENT_TEMPLATES[base] ?? buildMeta("customer-assistant");
  return {
    source_template: base,
    name: t.name,
    prompt: t.prompt,
    company_context_id: null,
    temperature: 0.7,
    llm_model: DEFAULT_TEXT_MODEL,
    max_output_tokens: 2048,
    color: t.color,
  };
}

export function getTextTemplateMeta(templateId: string): TextTemplateMeta {
  const base = resolveBaseTextTemplateId(templateId);
  return TEXT_AGENT_TEMPLATES[base] ?? buildMeta("customer-assistant");
}
