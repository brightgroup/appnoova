import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { deleteCampo, updateCampo, type PolizaCampoFieldType, type PolizaCampoPresentacion } from "@/lib/insurers/poliza-ramo-campos-db";

type Ctx = { params: Promise<{ id: string }> };

const VALID_TYPES: PolizaCampoFieldType[] = ["text", "number", "date", "select", "boolean", "multiselect"];
const VALID_PRESENTACIONES: PolizaCampoPresentacion[] = ["auto", "botones", "lista", "texto"];

export async function PATCH(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const body = await req.json().catch(() => ({}));

  if (body.field_type !== undefined && !VALID_TYPES.includes(body.field_type)) {
    return NextResponse.json({ error: "Tipo de campo inválido" }, { status: 400 });
  }
  if (body.presentacion !== undefined && !VALID_PRESENTACIONES.includes(body.presentacion)) {
    return NextResponse.json({ error: "Presentación inválida" }, { status: 400 });
  }

  const db = adminClient();
  try {
    const campo = await updateCampo(db, ctx.organizationId, id, {
      label: typeof body.label === "string" ? body.label : undefined,
      fieldType: body.field_type,
      options: Array.isArray(body.options) ? body.options.map(String) : undefined,
      pregunta: body.pregunta === null ? null : typeof body.pregunta === "string" ? body.pregunta : undefined,
      ayuda: body.ayuda === null ? null : typeof body.ayuda === "string" ? body.ayuda : undefined,
      presentacion: body.presentacion,
      aplicaCotizacion: typeof body.aplica_cotizacion === "boolean" ? body.aplica_cotizacion : undefined,
      requeridoCotizacion: typeof body.requerido_cotizacion === "boolean" ? body.requerido_cotizacion : undefined
    });
    return NextResponse.json({ campo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo actualizar el campo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, routeCtx: Ctx) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await routeCtx.params;
  const db = adminClient();
  await deleteCampo(db, ctx.organizationId, id);
  return NextResponse.json({ ok: true });
}
