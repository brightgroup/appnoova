import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getQuoteRequestById, markQuoteRequestQuoted, type QuoteResultPeriodicidad } from "@/lib/insurers/quote-requests-db";

type Ctx = { params: Promise<{ id: string }> };

const PERIODICIDADES: QuoteResultPeriodicidad[] = ["mensual", "anual", "mensual_y_anual", "pago_unico"];

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(v => v.trim());
  return items.length > 0 ? items : undefined;
}

/**
 * El asesor registra el resultado de una cotización que ya cotizó por fuera —
 * misma ficha que puede usar el formulario a mano o lo que ORI estructuró en
 * el chat de la ficha (ver estructurar_resultado_cotizacion, el asesor siempre
 * confirma con este mismo endpoint, nunca escribe ORI directo a la base).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const prima = typeof body.prima === "number" && body.prima > 0 ? body.prima : null;
  const primaAnual = typeof body.prima_anual === "number" && body.prima_anual > 0 ? body.prima_anual : null;
  if (!prima && !primaAnual) {
    return NextResponse.json({ error: "Falta el precio mensual o anual (debe ser mayor a 0)." }, { status: 400 });
  }

  const aseguradora = typeof body.aseguradora === "string" ? body.aseguradora.trim() : "";
  const vigenciaDesde = typeof body.vigencia_desde === "string" && body.vigencia_desde.trim() ? body.vigencia_desde : null;
  const vigenciaHasta = typeof body.vigencia_hasta === "string" && body.vigencia_hasta.trim() ? body.vigencia_hasta : null;
  const nombrePlan = typeof body.nombre_plan === "string" ? body.nombre_plan.trim() : "";
  const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
  const periodicidad = PERIODICIDADES.includes(body.periodicidad) ? (body.periodicidad as QuoteResultPeriodicidad) : undefined;

  const db = adminClient();
  const record = await getQuoteRequestById(db, orgCtx.organizationId, id);
  if (!record) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (record.estado !== "pendiente") {
    return NextResponse.json({ error: `Esta cotización ya está en estado "${record.estado}"` }, { status: 400 });
  }

  await markQuoteRequestQuoted(db, record.id, {
    resultado: {
      aseguradora: aseguradora || undefined,
      prima,
      prima_anual: primaAnual,
      vigencia_desde: vigenciaDesde,
      vigencia_hasta: vigenciaHasta,
      nombre_plan: nombrePlan || undefined,
      descripcion: descripcion || undefined,
      periodicidad,
      incluye: stringList(body.incluye),
      beneficios: stringList(body.beneficios)
    },
    quotedByUserId: orgCtx.userId
  });

  return NextResponse.json({ ok: true });
}
