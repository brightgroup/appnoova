import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgIdForUser } from "@/lib/billing/meter";

/** Carga el agente de texto vinculado a un canal WhatsApp (soporta filas legacy sin organization_id). */
export async function resolveTextAgentForChannel(
  db: SupabaseClient,
  input: { text_agent_id: string | null; user_id: string; organization_id?: string | null }
): Promise<{ agent: Record<string, unknown> | null; error?: string }> {
  const agentId = input.text_agent_id?.trim();
  if (!agentId) {
    return { agent: null, error: "Canal sin agente de texto asignado" };
  }

  const orgId =
    input.organization_id?.trim() ||
    (await resolveOrgIdForUser(db, input.user_id));

  if (orgId) {
    const { data: scoped, error: scopedErr } = await db
      .from("text_agents")
      .select("*")
      .eq("id", agentId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (scopedErr) {
      return { agent: null, error: "Agente de texto no encontrado" };
    }
    if (scoped) return { agent: scoped };

    // Legacy: agente creado antes de multitenancy (organization_id null, mismo dueño).
    const { data: legacy, error: legacyErr } = await db
      .from("text_agents")
      .select("*")
      .eq("id", agentId)
      .eq("user_id", input.user_id)
      .is("organization_id", null)
      .maybeSingle();

    if (legacyErr || !legacy) {
      return { agent: null, error: "Agente de texto no encontrado" };
    }
    return { agent: legacy };
  }

  const { data: agent, error } = await db
    .from("text_agents")
    .select("*")
    .eq("id", agentId)
    .eq("user_id", input.user_id)
    .maybeSingle();

  if (error || !agent) {
    return { agent: null, error: "Agente de texto no encontrado" };
  }
  return { agent };
}
