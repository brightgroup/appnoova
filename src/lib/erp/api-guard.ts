import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";
import type { OrgContext } from "@/lib/org-server";
import type { PermissionLevel } from "@/types/rbac";

/**
 * Doble compuerta de cada ruta de ERP: el permiso RBAC del usuario dentro de su
 * organización (requireOrgModule) y que la organización tenga el módulo
 * encendido siquiera (assertOrgErpEnabled) — el gating de sidebar/ruta en el
 * dashboard es solo cosmético, esto es lo que realmente protege la API.
 */
export async function requireErpAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<OrgContext | NextResponse> {
  const ctx = await requireOrgModule(req, "erp", minLevel);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const gate = await assertOrgErpEnabled(db, ctx.organizationId);
  if (gate.ok === false) return NextResponse.json({ error: gate.message }, { status: 403 });

  return ctx;
}
