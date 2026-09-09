import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
import { getOrgPermissionLevel, type OrgContext } from "@/lib/org-server";
import { adminClient } from "@/lib/voice-agents-server";
import { parseOrgModules } from "@/lib/org-modules";
import type { PermissionLevel } from "@/types/rbac";

export interface CrmRequestContext extends OrgContext {}

export async function requireCrmAccess(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<CrmRequestContext | NextResponse> {
  return requireOrgModule(req, "crm", minLevel);
}

/** user_id bajo el cual viven los datos CRM compartidos de la org (propietario). */
export async function getCrmUserId(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<string | NextResponse> {
  const ctx = await requireCrmAccess(req, minLevel);
  if (ctx instanceof NextResponse) return ctx;
  return resolveOrgCrmTenantUserId(ctx.organizationId, ctx.userId);
}

export interface CrmLeadVisibility {
  organizationId: string;
  /** El usuario real que hace la petición (no el tenant) — para asignar/filtrar por "lo mío". */
  callerUserId: string;
  /** user_id bajo el cual viven los leads/contactos de la org (ver getCrmUserId). */
  tenantUserId: string;
  /** true = nivel `manage` en el módulo crm (dueño/admin): ve y administra todos los leads de la org. */
  canManageAll: boolean;
}

/**
 * Visibilidad de LEADS estilo HubSpot: el dueño/admin (crm:manage) ve todo;
 * un asesor (crm:edit, sin manage) solo lo que tiene asignado
 * (`crm_leads.assigned_user_id`). Ver migración 130_crm_lead_assignment.sql.
 * Los contactos no usan esto todavía — siguen compartidos para cualquiera
 * con acceso al módulo crm.
 *
 * SOLO aplica para organizaciones con el módulo `seguros` activo — para el
 * resto de clientes de Noova, `canManageAll` siempre da `true` (mismo
 * comportamiento de siempre: cualquiera con acceso al CRM ve todo). Esto es
 * a propósito: es un cambio de comportamiento real (oculta leads que antes
 * se veían), no solo un campo nuevo, así que no debía aplicarse a clientes
 * que no lo pidieron.
 */
export async function getCrmLeadVisibility(
  req: NextRequest,
  minLevel: PermissionLevel = "view"
): Promise<CrmLeadVisibility | NextResponse> {
  const ctx = await requireCrmAccess(req, minLevel);
  if (ctx instanceof NextResponse) return ctx;
  const db = adminClient();
  const [tenantUserId, level, org] = await Promise.all([
    resolveOrgCrmTenantUserId(ctx.organizationId, ctx.userId),
    getOrgPermissionLevel(ctx.userId, ctx.organizationId, "crm"),
    db.from("organizations").select("settings").eq("id", ctx.organizationId).maybeSingle()
  ]);
  const segurosEnabled = parseOrgModules(org.data?.settings).seguros;
  return {
    organizationId: ctx.organizationId,
    callerUserId: ctx.userId,
    tenantUserId,
    canManageAll: segurosEnabled ? level === "manage" : true
  };
}
