import type { TextAgentFormData } from "@/types/text-agent";
import { DEFAULT_TEXT_MODEL } from "@/lib/text-agent-options";
import { resolveBaseTextTemplateId } from "@/lib/text-agent-templates";
import { normalizeNotifyTeamRules } from "@/lib/text-notify-rules";

export function normalizeTextAgentForm(raw: Partial<TextAgentFormData>): TextAgentFormData {
  const temperature = Number(raw.temperature);
  const maxOutput = Number(raw.max_output_tokens);

  return {
    source_template: resolveBaseTextTemplateId(String(raw.source_template ?? "customer-assistant")),
    name: String(raw.name ?? "").trim(),
    prompt: String(raw.prompt ?? ""),
    company_context_id: raw.company_context_id ?? null,
    data_table_id: raw.data_table_id ?? null,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0.1, temperature)) : 0.7,
    llm_model: String(raw.llm_model ?? DEFAULT_TEXT_MODEL).trim() || DEFAULT_TEXT_MODEL,
    max_output_tokens: Number.isFinite(maxOutput) ? Math.min(8192, Math.max(256, maxOutput)) : 2048,
    color: raw.color ?? null,
    notify_rules: normalizeNotifyTeamRules(raw.notify_rules)
  };
}

export function geminiTextTemperature(value: number): number {
  return Math.min(2, Math.max(0.1, value));
}
