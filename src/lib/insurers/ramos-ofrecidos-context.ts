import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Ramos ofrecidos" (`/dashboard/seguros/configuracion`, guardado en
 * `organizations.settings.seguros.ramos_ofrecidos`) prometía desde su propio
 * subtítulo darle "contexto a los agentes de IA" — pero nada lo leía todavía:
 * el prompt del agente es texto libre que el corredor escribe a mano, y si
 * marca/desmarca ramos después, ese texto queda desactualizado. Esto resuelve
 * la desincronización con el mismo patrón que ya usa mergeCompanyContext para
 * el contexto de marca: un bloque calculado en cada turno, nunca guardado en
 * el prompt mismo.
 */
export async function getRamosOfrecidosLabels(db: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data: org } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const settings = (org?.settings as Record<string, unknown>) ?? {};
  const seguros = (settings.seguros as Record<string, unknown>) ?? {};
  const slugs = Array.isArray(seguros.ramos_ofrecidos) ? (seguros.ramos_ofrecidos as unknown[]).filter((s): s is string => typeof s === "string") : [];
  if (slugs.length === 0) return [];

  const { data: ramos } = await db.from("ramos_catalogo").select("nombre").in("slug", slugs).order("nombre");
  return (ramos ?? []).map(r => r.nombre as string);
}

/** Combina el prompt del agente con la lista real de ramos que la agencia ofrece — no-op si la organización no ha configurado ninguno. */
export function mergeRamosOfrecidosContext(agentPrompt: string, ramosOfrecidos: string[]): string {
  if (ramosOfrecidos.length === 0) return agentPrompt;

  const block =
    `Ramos de seguros que esta agencia ofrece HOY (lista real y actualizada, mantenida por el corredor — ` +
    `no menciones ni ofrezcas ramos fuera de esta lista; si el cliente pregunta por uno que no está aquí, dile ` +
    `que no lo manejan): ${ramosOfrecidos.join(", ")}.`;

  return `${block}\n\n---\n\n${agentPrompt.trim()}`;
}
