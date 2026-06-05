import { deriveQualityLabel } from "@/lib/voice-agent-display";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import { resolveBaseTemplateId } from "@/lib/voice-agent-templates";
import type { VoiceAgentListItem, VoiceAgentRecord, VoiceAgentStats } from "@/types/voice-agent";

function resolveSourceTemplate(raw: Record<string, unknown>): string {
  if (raw.source_template) return String(raw.source_template);
  return resolveBaseTemplateId(String(raw.template_id ?? "lead-qualification"));
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeVoiceAgentStats(raw: Partial<VoiceAgentStats> & { calls_count?: number }): VoiceAgentStats {
  const calls = num(raw.calls_count);
  return {
    contacts_count: num(raw.contacts_count),
    contacted_count: num(raw.contacted_count),
    calls_count: calls,
    goals_achieved: num(raw.goals_achieved),
    cost_usd: num(raw.cost_usd),
    quality_label: raw.quality_label || deriveQualityLabel(calls)
  };
}

export function toVoiceAgentRecord(raw: Record<string, unknown>): VoiceAgentRecord {
  const stats = normalizeVoiceAgentStats(raw);
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    status: String(raw.status ?? "active"),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ...normalizeVoiceAgentForm({ ...raw, template_id: String(raw.template_id) }),
    ...stats
  };
}

export function toVoiceAgentListItem(raw: Record<string, unknown>): VoiceAgentListItem {
  const stats = normalizeVoiceAgentStats(raw);
  return {
    id: String(raw.id),
    source_template: resolveSourceTemplate(raw),
    name: String(raw.name ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ...stats
  };
}
