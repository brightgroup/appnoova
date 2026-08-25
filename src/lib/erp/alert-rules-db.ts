import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryAlertMode = "al_cruzar" | "resumen_diario" | "ambos";

export interface InventoryAlertRule {
  organizationId: string;
  enabled: boolean;
  canalEmail: boolean;
  destinatarios: string[];
  modo: InventoryAlertMode;
  horaResumen: number;
  updatedAt: string;
}

interface InventoryAlertRuleRow {
  organization_id: string;
  enabled: boolean;
  canal_email: boolean;
  destinatarios: string[] | null;
  modo: string;
  hora_resumen: number;
  updated_at: string;
}

function toRuleRecord(row: InventoryAlertRuleRow): InventoryAlertRule {
  return {
    organizationId: row.organization_id,
    enabled: row.enabled,
    canalEmail: row.canal_email,
    destinatarios: row.destinatarios ?? [],
    modo: row.modo as InventoryAlertMode,
    horaResumen: row.hora_resumen,
    updatedAt: row.updated_at
  };
}

export function defaultInventoryAlertRule(organizationId: string): InventoryAlertRule {
  return {
    organizationId,
    enabled: true,
    canalEmail: true,
    destinatarios: [],
    modo: "al_cruzar",
    horaResumen: 8,
    updatedAt: new Date(0).toISOString()
  };
}

/** Fila por defecto (no creada aún) si la organización nunca configuró su regla. */
export async function getInventoryAlertRule(
  db: SupabaseClient,
  organizationId: string
): Promise<InventoryAlertRule> {
  const { data, error } = await db
    .from("erp_inventory_alert_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRuleRecord(data as InventoryAlertRuleRow) : defaultInventoryAlertRule(organizationId);
}

export interface InventoryAlertRulePatch {
  enabled?: boolean;
  canalEmail?: boolean;
  destinatarios?: string[];
  modo?: InventoryAlertMode;
  horaResumen?: number;
}

export async function upsertInventoryAlertRule(
  db: SupabaseClient,
  organizationId: string,
  patch: InventoryAlertRulePatch
): Promise<InventoryAlertRule> {
  const current = await getInventoryAlertRule(db, organizationId);
  const merged = {
    organization_id: organizationId,
    enabled: patch.enabled ?? current.enabled,
    canal_email: patch.canalEmail ?? current.canalEmail,
    destinatarios:
      patch.destinatarios !== undefined
        ? patch.destinatarios.map(e => e.trim().toLowerCase()).filter(e => e.includes("@"))
        : current.destinatarios,
    modo: patch.modo ?? current.modo,
    hora_resumen: patch.horaResumen ?? current.horaResumen,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await db
    .from("erp_inventory_alert_rules")
    .upsert(merged, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toRuleRecord(data as InventoryAlertRuleRow);
}
