import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { createPoliza, listPolizas, type PolizaEstado } from "@/lib/insurers/polizas-db";
import { findOrCreateContactForPoliza } from "@/lib/insurers/poliza-contact-match";

export async function GET(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const estado = req.nextUrl.searchParams.get("estado") as PolizaEstado | null;
  const search = req.nextUrl.searchParams.get("q") ?? undefined;
  const db = adminClient();
  const polizas = await listPolizas(db, ctx.crmUserId, {
    estado: estado ?? undefined,
    search
  });

  return NextResponse.json({ polizas });
}

export async function POST(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const aseguradora = String(body.aseguradora ?? "").trim();
  const ramo = String(body.ramo ?? "").trim();
  const vigenciaHasta = body.vigencia_hasta ? String(body.vigencia_hasta) : null;
  if (!aseguradora) return NextResponse.json({ error: "Falta la aseguradora" }, { status: 400 });
  if (!ramo) return NextResponse.json({ error: "Falta el ramo" }, { status: 400 });
  if (!vigenciaHasta) return NextResponse.json({ error: "Falta la fecha de vencimiento" }, { status: 400 });

  const db = adminClient();

  let contactId = body.contact_id ? String(body.contact_id) : null;
  if (!contactId) {
    const tomador = String(body.tomador ?? "").trim();
    if (!tomador) return NextResponse.json({ error: "Falta el contacto (contact_id o tomador)" }, { status: 400 });
    try {
      const match = await findOrCreateContactForPoliza(db, ctx.crmUserId, {
        nombre: tomador,
        documento: body.documento ?? null,
        telefono: body.telefono ?? null,
        fuenteOrigen: "importacion_polizas"
      });
      contactId = match.contactId;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo resolver el contacto" },
        { status: 500 }
      );
    }
  }

  try {
    const poliza = await createPoliza(db, ctx.crmUserId, {
      contactId,
      aseguradora,
      ramo,
      numeroPoliza: body.numero_poliza ? String(body.numero_poliza) : null,
      vigenciaDesde: body.vigencia_desde ? String(body.vigencia_desde) : null,
      vigenciaHasta,
      prima: body.prima !== undefined && body.prima !== null && body.prima !== "" ? Number(body.prima) : null,
      periodicidadPago: body.periodicidad_pago ?? null,
      estado: body.estado ?? "activa",
      fuente: "manual"
    });
    return NextResponse.json({ poliza });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo crear la póliza" }, { status: 500 });
  }
}
