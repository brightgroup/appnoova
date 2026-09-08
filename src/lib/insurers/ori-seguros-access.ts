import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOrgModules } from "@/lib/org-modules";

/**
 * Si ORI (copiloto interno) puede cotizar seguros para esta organización.
 * Alcanza con el módulo `seguros` encendido — ORI es el copiloto del propio
 * corredor, no un canal público. Antes exigía además una aseguradora
 * conectada, pero eso bloqueaba de raíz las tools de vida/hogar (nunca van a
 * tener conector) y hacía inútil la cola humana antes de conectar la primera
 * aseguradora; cada tool ya avisa por su cuenta cuando algo puntual (ej. la
 * cotización automática de autos) sí necesita un conector.
 */
export async function getOriSegurosAccess(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data: org } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  return parseOrgModules(org?.settings).seguros;
}
