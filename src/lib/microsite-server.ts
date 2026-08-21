import type { SupabaseClient } from "@supabase/supabase-js";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { toMicrositeRecord, toPublicMicrositeConfig } from "@/lib/microsite-record";
import type { BrokerMicrositeRecord, PublicMicrositeConfig } from "@/types/microsite";

async function resolveBrandName(
  db: SupabaseClient,
  organizationId: string,
  companyContextId: string | null
): Promise<string> {
  if (!companyContextId) return "";
  const { data: ctx } = await db
    .from("company_contexts")
    .select("name")
    .eq("id", companyContextId)
    .eq("organization_id", organizationId)
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
    .select("id, name, organization_id, company_context_id")
    .eq("id", microsite.text_agent_id)
    .maybeSingle();

  if (!agent || String(agent.organization_id) !== microsite.organization_id) return null;

  const contextId = agent.company_context_id
    ? String(agent.company_context_id)
    : microsite.company_context_id;
  const brandName = await resolveBrandName(db, microsite.organization_id, contextId);

  return toPublicMicrositeConfig(microsite, brandName, String(agent.name));
}

export async function listMicrositesForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<BrokerMicrositeRecord[]> {
  const { data, error } = await db
    .from("broker_microsites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map(toMicrositeRecord);
}

export async function getMicrositeById(
  db: SupabaseClient,
  organizationId: string,
  id: string
): Promise<BrokerMicrositeRecord | null> {
  const { data, error } = await db
    .from("broker_microsites")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
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

export async function getMicrositePreviewForOrg(
  organizationId: string,
  id?: string
): Promise<{ microsite: BrokerMicrositeRecord; config: PublicMicrositeConfig } | null> {
  const db = textAgentsAdminClient();
  const microsite = id
    ? await getMicrositeById(db, organizationId, id)
    : (await listMicrositesForOrg(db, organizationId))[0] ?? null;
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
    .eq("organization_id", microsite.organization_id)
    .maybeSingle();

  if (agentErr || !agent) return null;

  let companyContextText = "";
  const contextId = agent.company_context_id ?? microsite.company_context_id;
  if (contextId) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", contextId)
      .eq("organization_id", microsite.organization_id)
      .maybeSingle();
    companyContextText = String(ctx?.content ?? "");
  }

  // Las conversaciones de este agente (WhatsApp, inbox, "probar") se particionan por
  // el dueño del agente, no por quién creó el Mi Link — deben coincidir aunque el Mi
  // Link haya sido creado por otro miembro del mismo equipo.
  return { microsite, agent, companyContextText, userId: String(agent.user_id) };
}
