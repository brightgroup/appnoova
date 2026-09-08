import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { assertOrgSegurosEnabled } from "@/lib/org-modules";
import { adminClient } from "@/lib/voice-agents-server";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
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

export interface SegurosCrmContext {
  organizationId: string;
  actorUserId: string;
  /** user_id bajo el que viven polizas/crm_contacts de esta org (eje CRM, ver org-crm-tenant.ts). */
  crmUserId: string;
}

/**
 * Igual que requireSegurosAccess, pero además resuelve el user_id del eje
 * CRM — necesario porque `polizas` cuelga de `crm_contacts` (user_id-scoped,
 * ver 112_polizas.sql) mientras el resto del módulo seguros vive en el eje
 * organization_id.
 */
export async function requireSegurosCrmAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<SegurosCrmContext | NextResponse> {
  const ctx = await requireSegurosAccess(req, minLevel);
  if (ctx instanceof NextResponse) return ctx;

  const crmUserId = await resolveOrgCrmTenantUserId(ctx.organizationId, ctx.userId);
  return { organizationId: ctx.organizationId, actorUserId: ctx.userId, crmUserId };
}
