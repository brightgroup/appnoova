import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmTenantLabelKey, CrmTenantLabels } from "@/types/crm";

export const DEFAULT_TENANT_LABELS: Record<CrmTenantLabelKey, string> = {
  producto_servicio: "Producto / Servicio",
  categoria_interes: "Categoría de interés",
  asesor_asignado: "Responsable"
};

const LABEL_KEYS = Object.keys(DEFAULT_TENANT_LABELS) as CrmTenantLabelKey[];

export async function ensureDefaultTenantLabels(db: SupabaseClient, userId: string) {
  const { count } = await db
    .from("crm_tenant_label_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return;

  await db.from("crm_tenant_label_config").insert(
    LABEL_KEYS.map(campo_tecnico => ({
      user_id: userId,
      campo_tecnico,
      label_personalizado: DEFAULT_TENANT_LABELS[campo_tecnico]
    }))
  );
}

export async function getTenantLabels(db: SupabaseClient, userId: string): Promise<CrmTenantLabels> {
  await ensureDefaultTenantLabels(db, userId);
  const { data } = await db
    .from("crm_tenant_label_config")
    .select("campo_tecnico, label_personalizado")
    .eq("user_id", userId);

  const labels = { ...DEFAULT_TENANT_LABELS };
  for (const row of data ?? []) {
    const key = String(row.campo_tecnico) as CrmTenantLabelKey;
    if (key in labels) labels[key] = String(row.label_personalizado);
  }
  return labels;
}
