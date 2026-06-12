import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase-table-error";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { toPublicWidgetConfig, toWidgetRecord } from "@/lib/widget-record";
import type { BrokerWebWidgetRecord, PublicMicrositeConfig } from "@/types/microsite";

async function resolveBrandName(
  db: SupabaseClient,
  userId: string,
  companyContextId: string | null
): Promise<string> {
  if (!companyContextId) return "";
  const { data: ctx } = await db
    .from("company_contexts")
    .select("name")
    .eq("id", companyContextId)
    .eq("user_id", userId)
    .maybeSingle();
  return String(ctx?.name ?? "");
}

async function buildWidgetPublicConfig(
  db: SupabaseClient,
  widget: BrokerWebWidgetRecord
): Promise<PublicMicrositeConfig | null> {
  if (!widget.text_agent_id) return null;

  const { data: agent } = await db
    .from("text_agents")
    .select("id, name, user_id, company_context_id")
    .eq("id", widget.text_agent_id)
    .maybeSingle();

  if (!agent || String(agent.user_id) !== widget.user_id) return null;

  const contextId = agent.company_context_id ? String(agent.company_context_id) : null;
  const brandName = await resolveBrandName(db, widget.user_id, contextId);

  return toPublicWidgetConfig(widget, brandName, String(agent.name));
}

export async function getWidgetByUserId(
  db: SupabaseClient,
  userId: string
): Promise<BrokerWebWidgetRecord | null> {
  const { data, error } = await db
    .from("broker_web_widgets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toWidgetRecord(data);
}

export type WidgetEnsureResult =
  | { ok: true; widget: BrokerWebWidgetRecord }
  | { ok: false; code: "missing_table" | "missing_column" | "unknown"; message: string };

export function mapWidgetDbError(error: { code?: string; message?: string }): WidgetEnsureResult {
  if (isMissingTableError(error)) {
    return {
      ok: false,
      code: "missing_table",
      message: "Falta la tabla broker_web_widgets. Ejecuta 018_broker_web_widgets.sql en Supabase."
    };
  }
  if (isMissingColumnError(error)) {
    return {
      ok: false,
      code: "missing_column",
      message: "Falta migrar el widget independiente. Ejecuta 020_widget_standalone.sql en Supabase."
    };
  }
  return {
    ok: false,
    code: "unknown",
    message: String(error.message ?? "Error al acceder al widget")
  };
}

export async function getWidgetBySlug(
  slug: string,
  options?: { requirePublished?: boolean }
): Promise<{ widget: BrokerWebWidgetRecord; config: PublicMicrositeConfig } | null> {
  const requirePublished = options?.requirePublished !== false;
  const db = textAgentsAdminClient();

  let query = db.from("broker_web_widgets").select("*").eq("slug", slug);
  if (requirePublished) {
    query = query.eq("is_published", true);
  }

  const { data: widgetRow, error: widgetErr } = await query.maybeSingle();
  if (widgetErr || !widgetRow) return null;

  const widget = toWidgetRecord(widgetRow);
  const config = await buildWidgetPublicConfig(db, widget);
  if (!config) return null;

  return { widget, config };
}

export async function getPublishedWidgetBySlug(
  slug: string
): Promise<{ widget: BrokerWebWidgetRecord; config: PublicMicrositeConfig } | null> {
  return getWidgetBySlug(slug, { requirePublished: true });
}

export async function resolveWidgetAgentForChat(
  slug: string,
  options?: { requirePublished?: boolean }
) {
  const requirePublished = options?.requirePublished !== false;
  const db = textAgentsAdminClient();

  let query = db.from("broker_web_widgets").select("*").eq("slug", slug);
  if (requirePublished) {
    query = query.eq("is_published", true);
  }

  const { data: widgetRow, error: widgetErr } = await query.maybeSingle();
  if (widgetErr || !widgetRow || !widgetRow.text_agent_id) return null;

  const widget = toWidgetRecord(widgetRow);

  const { data: agent, error: agentErr } = await db
    .from("text_agents")
    .select("*")
    .eq("id", widget.text_agent_id)
    .eq("user_id", widget.user_id)
    .maybeSingle();

  if (agentErr || !agent) return null;

  let companyContextText = "";
  const contextId = agent.company_context_id ? String(agent.company_context_id) : null;
  if (contextId) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", contextId)
      .eq("user_id", widget.user_id)
      .maybeSingle();
    companyContextText = String(ctx?.content ?? "");
  }

  return { widget, agent, companyContextText, userId: widget.user_id };
}
