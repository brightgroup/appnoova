/**
 * Módulos habilitados por organización (superadmin) — separado del RBAC por rol.
 * RBAC ("erp" en src/types/rbac.ts) decide QUÉ puede hacer un usuario dentro de
 * su organización; esto decide SI la organización tiene el módulo siquiera.
 * Ninguno de los dos alcanza solo: las plantillas de rol en /admin/roles son
 * globales (se propagan a todas las organizaciones), así que la única forma de
 * encender un módulo para una sola organización es este flag.
 */
import type { adminClient } from "@/lib/voice-agents-server";

type Db = ReturnType<typeof adminClient>;

export interface OrgModules {
  erp: boolean;
}

export const DEFAULT_ORG_MODULES: OrgModules = {
  erp: false,
};

export function parseOrgModules(settings: unknown): OrgModules {
  if (!settings || typeof settings !== "object") return { ...DEFAULT_ORG_MODULES };
  const modules = (settings as Record<string, unknown>).modules;
  if (!modules || typeof modules !== "object") return { ...DEFAULT_ORG_MODULES };
  return {
    erp: (modules as Record<string, unknown>).erp === true,
  };
}

export function mergeOrgModulesSettings(
  current: unknown,
  modules: Partial<OrgModules>
): Record<string, unknown> {
  const base =
    current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  const prev = parseOrgModules(base);
  return {
    ...base,
    modules: {
      ...prev,
      ...modules,
    },
  };
}

/**
 * Verificación server-side antes de servir cualquier dato de ERP. El gating de
 * sidebar/ruta en el dashboard es solo cosmético (cliente) — sin este chequeo,
 * el owner de una organización sin el módulo podría llamar la API directo.
 */
export async function assertOrgErpEnabled(
  db: Db,
  organizationId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: org } = await db
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();

  const modules = parseOrgModules(org?.settings);
  if (!modules.erp) {
    return { ok: false, message: "El módulo ERP no está habilitado para esta organización." };
  }
  return { ok: true };
}
