import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOrgModules } from "@/lib/org-modules";

/**
 * Si ORI (copiloto interno) puede consultar el inventario de esta organización.
 * Dos compuertas, igual que el resto de ERP: el módulo debe estar encendido para
 * la organización Y este toggle debe estar activo — ninguna de las dos sola alcanza.
 */
export async function getOriInventoryAccess(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const [{ data: org }, { data: access }] = await Promise.all([
    db.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    db.from("erp_ori_access").select("enabled").eq("organization_id", organizationId).maybeSingle()
  ]);

  if (!parseOrgModules(org?.settings).erp) return false;
  return access?.enabled === true;
}

export async function setOriInventoryAccess(
  db: SupabaseClient,
  organizationId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await db
    .from("erp_ori_access")
    .upsert(
      { organization_id: organizationId, enabled, updated_at: new Date().toISOString() },
      { onConflict: "organization_id" }
    );
  if (error) throw new Error(error.message);
}
