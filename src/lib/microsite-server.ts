import type { SupabaseClient } from "@supabase/supabase-js";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { toMicrositeRecord, toPublicMicrositeConfig } from "@/lib/microsite-record";
import type { BrokerMicrositeRecord, PublicMicrositeConfig } from "@/types/microsite";

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

async function buildPublicConfig(
  db: SupabaseClient,
  microsite: BrokerMicrositeRecord
): Promise<PublicMicrositeConfig | null> {
  if (!microsite.text_agent_id) return null;

  const { data: agent } = await db
    .from("text_agents")
    .select("id, name, user_id, company_context_id")
    .eq("id", microsite.text_agent_id)
    .maybeSingle();

  if (!agent || String(agent.user_id) !== microsite.user_id) return null;

  const contextId = agent.company_context_id
    ? String(agent.company_context_id)
    : microsite.company_context_id;
  const brandName = await resolveBrandName(db, microsite.user_id, contextId);

  return toPublicMicrositeConfig(microsite, brandName, String(agent.name));
}

export async function getMicrositeByUserId(
  db: SupabaseClient,
  userId: string
): Promise<BrokerMicrositeRecord | null> {
  const { data, error } = await db
    .from("broker_microsites")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toMicrositeRecord(data);
}

export async function getPublishedMicrositeBySlug(
  slug: string
): Promise<{ microsite: BrokerMicrositeRecord; config: PublicMicrositeConfig } | null> {
  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("broker_microsites")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) return null;

  const microsite = toMicrositeRecord(data);
  const config = await buildPublicConfig(db, microsite);
  if (!config) return null;

  return { microsite, config };
}

export async function getMicrositePreviewForUser(
  userId: string
): Promise<{ microsite: BrokerMicrositeRecord; config: PublicMicrositeConfig } | null> {
  const db = textAgentsAdminClient();
  const microsite = await getMicrositeByUserId(db, userId);
  if (!microsite) return null;

  const config = await buildPublicConfig(db, microsite);
  if (!config) return null;

  return { microsite, config };
}

export async function resolveMicrositeAgentForChat(slug: string) {
  const db = textAgentsAdminClient();
  const { data: site, error } = await db
    .from("broker_microsites")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !site) return null;

  const microsite = toMicrositeRecord(site);
  if (!microsite.text_agent_id) return null;

  const { data: agent, error: agentErr } = await db
    .from("text_agents")
    .select("*")
    .eq("id", microsite.text_agent_id)
    .eq("user_id", microsite.user_id)
    .maybeSingle();

  if (agentErr || !agent) return null;

  let companyContextText = "";
  const contextId = agent.company_context_id ?? microsite.company_context_id;
  if (contextId) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", contextId)
      .eq("user_id", microsite.user_id)
      .maybeSingle();
    companyContextText = String(ctx?.content ?? "");
  }

  return { microsite, agent, companyContextText, userId: microsite.user_id };
}
