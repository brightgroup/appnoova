import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOrgModules } from "@/lib/org-modules";

/**
 * Si ORI (copiloto interno) puede cotizar seguros para esta organización.
 * A diferencia de ERP (que además exige un toggle propio en erp_ori_access),
 * acá alcanza con el módulo `seguros` encendido + al menos una aseguradora
 * conectada — ORI es el copiloto del propio corredor, no un canal público.
 */
export async function getOriSegurosAccess(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const [{ data: org }, { data: connections }] = await Promise.all([
    db.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    db
      .from("insurer_connections")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1)
  ]);

  if (!parseOrgModules(org?.settings).seguros) return false;
  return (connections?.length ?? 0) > 0;
}
