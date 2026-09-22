import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest, getOrgPermissionLevel, hasOrgPermission } from "@/lib/org-server";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { getOriInventoryAccess } from "@/lib/erp/ori-access-db";
import { listInventoryBrands, listInventoryPage } from "@/lib/erp/inventory-listing-db";

/**
 * Listado paginado de inventario para la vista móvil.
 *
 * La compuerta NO es la de `requireErpAccess` a propósito: esta pantalla es
 * "el listado completo de lo que Ori te acaba de mostrar", así que quien pueda
 * preguntarle a Ori por inventario tiene que poder abrirla. De ahí que valga
 * cualquiera de las dos vías — permiso RBAC de ERP, o el toggle de organización
 * que ya habilita la tool de Ori (erp_ori_access). En ambos casos el módulo ERP
 * debe estar encendido para la organización.
 */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const gate = await assertOrgErpEnabled(db, ctx.organizationId);
  if (gate.ok === false) return NextResponse.json({ error: gate.message }, { status: 403 });

  const [erpLevel, oriAccess] = await Promise.all([
    getOrgPermissionLevel(ctx.userId, ctx.organizationId, "erp"),
    getOriInventoryAccess(db, ctx.organizationId)
  ]);
  if (!hasOrgPermission(erpLevel, "view") && !oriAccess) {
    return NextResponse.json({ error: "No tienes acceso al inventario." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;

  try {
    const page = await listInventoryPage(db, ctx.organizationId, {
      search: params.get("q") ?? undefined,
      marca: params.get("marca") ?? undefined,
      soloBajoMinimo: params.get("bajo_minimo") === "1",
      offset: Number(params.get("offset") ?? 0),
      limit: Number(params.get("limit") ?? 25)
    });

    // Las marcas solo se piden en la primera página — no cambian mientras se hace scroll.
    const marcas = Number(params.get("offset") ?? 0) === 0
      ? await listInventoryBrands(db, ctx.organizationId)
      : undefined;

    return NextResponse.json({ ...page, ...(marcas ? { marcas } : {}) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al listar" }, { status: 500 });
  }
}
