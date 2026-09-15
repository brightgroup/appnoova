import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import {
  createCampo,
  listCamposPorRamo,
  listTodosLosCampos,
  type PolizaCampoFieldType,
  type PolizaCampoPresentacion
} from "@/lib/insurers/poliza-ramo-campos-db";

const VALID_TYPES: PolizaCampoFieldType[] = ["text", "number", "date", "select", "boolean", "multiselect"];
const VALID_PRESENTACIONES: PolizaCampoPresentacion[] = ["auto", "botones", "lista", "texto"];

/** GET ?ramo_id= (campos de un solo ramo) o sin parámetro (todos los campos de la org, para armar columnas dinámicas). */
export async function GET(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const ramoId = req.nextUrl.searchParams.get("ramo_id");
  const db = adminClient();
  const campos = ramoId
    ? await listCamposPorRamo(db, ctx.organizationId, ramoId)
    : await listTodosLosCampos(db, ctx.organizationId);

  return NextResponse.json({ campos });
}

export async function POST(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const ramoId = String(body.ramo_id ?? "").trim();
  const label = String(body.label ?? "").trim();
  const fieldType = body.field_type as PolizaCampoFieldType;

  if (!ramoId) return NextResponse.json({ error: "Falta el ramo" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Falta el nombre del campo" }, { status: 400 });
  if (!VALID_TYPES.includes(fieldType)) return NextResponse.json({ error: "Tipo de campo inválido" }, { status: 400 });
  if (body.presentacion !== undefined && !VALID_PRESENTACIONES.includes(body.presentacion)) {
    return NextResponse.json({ error: "Presentación inválida" }, { status: 400 });
  }

  const db = adminClient();
  try {
    const campo = await createCampo(db, ctx.organizationId, {
      ramoId,
      label,
      fieldType,
      options: Array.isArray(body.options) ? body.options.map(String) : [],
      pregunta: typeof body.pregunta === "string" ? body.pregunta : undefined,
      ayuda: typeof body.ayuda === "string" ? body.ayuda : undefined,
      presentacion: body.presentacion,
      aplicaCotizacion: typeof body.aplica_cotizacion === "boolean" ? body.aplica_cotizacion : undefined,
      requeridoCotizacion: typeof body.requerido_cotizacion === "boolean" ? body.requerido_cotizacion : undefined
    });
    return NextResponse.json({ campo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo crear el campo" }, { status: 500 });
  }
}
