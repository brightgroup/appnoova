import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOrgTextAgentIds(
  db: SupabaseClient,
  organizationId: string
): Promise<string[]> {
  const { data } = await db
    .from("text_agents")
    .select("id")
    .eq("organization_id", organizationId);

  return (data ?? []).map((r) => String(r.id));
}

export async function loadOrgTextAgentNames(
  db: SupabaseClient,
  organizationId: string
): Promise<Record<string, string>> {
  const { data } = await db
    .from("text_agents")
    .select("id, name")
    .eq("organization_id", organizationId);

  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    names[String(row.id)] = String(row.name ?? "Agente");
  }
  return names;
}

export async function conversationBelongsToOrg(
  db: SupabaseClient,
  conversationId: string,
  organizationId: string
): Promise<boolean> {
  const agentIds = await getOrgTextAgentIds(db, organizationId);
  if (!agentIds.length) return false;

  const { data } = await db
    .from("text_agent_conversations")
    .select("id")
    .eq("id", conversationId)
    .in("text_agent_id", agentIds)
    .maybeSingle();

  return Boolean(data);
}
