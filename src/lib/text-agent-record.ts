import { deriveTextQualityLabel } from "@/lib/text-agent-display";
import { normalizeTextAgentForm } from "@/lib/text-agent-form";
import { resolveBaseTextTemplateId } from "@/lib/text-agent-templates";
import type { TextAgentListItem, TextAgentRecord, TextAgentStats } from "@/types/text-agent";

function resolveSourceTemplate(raw: Record<string, unknown>): string {
  if (raw.source_template) return String(raw.source_template);
  return resolveBaseTextTemplateId(String(raw.template_id ?? "customer-assistant"));
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTextAgentStats(raw: Partial<TextAgentStats>): TextAgentStats {
  const conversations = num(raw.conversations_count);
  return {
    conversations_count: conversations,
    messages_count: num(raw.messages_count),
    goals_achieved: num(raw.goals_achieved),
    cost_usd: num(raw.cost_usd),
    quality_label: raw.quality_label || deriveTextQualityLabel(conversations)
  };
}

export function toTextAgentRecord(raw: Record<string, unknown>): TextAgentRecord {
  const stats = normalizeTextAgentStats(raw);
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    status: String(raw.status ?? "active"),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ...normalizeTextAgentForm({ ...raw, source_template: resolveSourceTemplate(raw) }),
    ...stats
  };
}

export function toTextAgentListItem(raw: Record<string, unknown>): TextAgentListItem {
  const stats = normalizeTextAgentStats(raw);
  return {
    id: String(raw.id),
    source_template: resolveSourceTemplate(raw),
    name: String(raw.name ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ...stats
  };
}
