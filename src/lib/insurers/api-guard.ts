import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { assertOrgSegurosEnabled } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";
import type { OrgContext } from "@/lib/org-server";
import type { PermissionLevel } from "@/types/rbac";

/**
 * Doble compuerta de cada ruta de Noova Seguros: el permiso RBAC del usuario
 * dentro de su organización (requireOrgModule) y que la organización tenga
 * el módulo encendido siquiera (assertOrgSegurosEnabled) — mismo patrón que
 * requireErpAccess en src/lib/erp/api-guard.ts.
 */
export async function requireSegurosAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<OrgContext | NextResponse> {
  const ctx = await requireOrgModule(req, "seguros", minLevel);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const gate = await assertOrgSegurosEnabled(db, ctx.organizationId);
  if (gate.ok === false) return NextResponse.json({ error: gate.message }, { status: 403 });

  return ctx;
}
