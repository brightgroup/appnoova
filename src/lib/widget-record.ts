import {
  DEFAULT_MICROSITE_ACCENT,
  DEFAULT_MICROSITE_BUTTON,
  DEFAULT_MICROSITE_QUICK_ACTIONS
} from "@/lib/microsite-defaults";
import { brandInitials, slugToDisplayName } from "@/lib/microsite-slug";
import type {
  BrokerWebWidgetFormData,
  BrokerWebWidgetRecord,
  MicrositeQuickAction,
  PublicMicrositeConfig
} from "@/types/microsite";

function normalizeQuickActions(raw: unknown): MicrositeQuickAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      if (!id) return null;
      return {
        id,
        label: String(row.label ?? "").trim(),
        prompt: String(row.prompt ?? "").trim(),
        icon: String(row.icon ?? "MessageCircle").trim(),
        enabled: row.enabled !== false
      } satisfies MicrositeQuickAction;
    })
    .filter((a): a is MicrositeQuickAction => a !== null);
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const v = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function withAssetCacheBust(url: string | null, version: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/[?&]v=/.test(trimmed)) return trimmed;
  const sep = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${sep}v=${encodeURIComponent(version)}`;
}

export function normalizeWidgetForm(raw: Partial<BrokerWebWidgetFormData>): BrokerWebWidgetFormData {
  return {
    text_agent_id: raw.text_agent_id ?? null,
    accent_color: normalizeHexColor(raw.accent_color, DEFAULT_MICROSITE_ACCENT),
    button_color: normalizeHexColor(raw.button_color, DEFAULT_MICROSITE_BUTTON),
    logo_url: raw.logo_url ? String(raw.logo_url).trim() : null,
    favicon_url: raw.favicon_url ? String(raw.favicon_url).trim() : null,
    agent_display_name: raw.agent_display_name ? String(raw.agent_display_name).trim() : null,
    quick_actions: normalizeQuickActions(raw.quick_actions),
    is_published: Boolean(raw.is_published)
  };
}

export function widgetDefaultForm(): BrokerWebWidgetFormData {
  return normalizeWidgetForm({
    quick_actions: DEFAULT_MICROSITE_QUICK_ACTIONS
  });
}

export function toWidgetRecord(raw: Record<string, unknown>): BrokerWebWidgetRecord {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    slug: String(raw.slug),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    ...normalizeWidgetForm({
      text_agent_id: raw.text_agent_id ? String(raw.text_agent_id) : null,
      accent_color: raw.accent_color as string | undefined,
      button_color: raw.button_color as string | undefined,
      logo_url: raw.logo_url ? String(raw.logo_url) : null,
      favicon_url: raw.favicon_url ? String(raw.favicon_url) : null,
      agent_display_name: raw.agent_display_name ? String(raw.agent_display_name) : null,
      quick_actions: raw.quick_actions as MicrositeQuickAction[] | undefined,
      is_published: Boolean(raw.is_published)
    })
  };
}

export function toPublicWidgetConfig(
  widget: BrokerWebWidgetRecord,
  brandName: string,
  agentName: string
): PublicMicrositeConfig {
  const name = slugToDisplayName(widget.slug) || brandName.trim() || "Mi empresa";
  const displayAgent = widget.agent_display_name?.trim() || agentName.trim() || "Asistente";
  const version = widget.updated_at || widget.slug;

  return {
    slug: widget.slug,
    name,
    agentName: displayAgent,
    initials: brandInitials(name),
    logoUrl: withAssetCacheBust(widget.logo_url, version),
    faviconUrl: withAssetCacheBust(widget.favicon_url, version),
    accent: widget.accent_color,
    buttonColor: widget.button_color,
    quickActions: widget.quick_actions.filter(
      a => a.enabled && a.label.trim() && a.prompt.trim()
    ),
    chatEndpoint: `/api/public/microsite/${widget.slug}/chat`
  };
}
