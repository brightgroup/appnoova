import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { listCamposPorRamo, createCamposBulk, type CreateCampoInput } from "@/lib/insurers/poliza-ramo-campos-db";
import { RAMOS_COTIZABLES, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";
import { DEFAULT_CAMPOS_POR_RAMO } from "@/lib/insurers/ramo-campos-defaults";

/**
 * Materializa los valores por defecto de un ramo (ramo-campos-defaults.ts) en
 * filas reales de `poliza_ramo_campos` — lo que dispara la UI la primera vez
 * que una organización abre "Preguntas que hace la IA" para un ramo y quiere
 * empezar a editar en vez de solo ver el default. Idempotente: si el ramo ya
 * tiene filas, no hace nada (evita duplicar si el usuario hace doble clic).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const ramo = String(body.ramo ?? "").trim() as RamoCotizable;
  if (!(ramo in RAMOS_COTIZABLES)) {
    return NextResponse.json({ error: "Ramo inválido" }, { status: 400 });
  }

  const defaults = DEFAULT_CAMPOS_POR_RAMO[ramo];
  if (!defaults || defaults.length === 0) {
    return NextResponse.json({ error: "Este ramo no tiene valores por defecto configurables todavía" }, { status: 400 });
  }

  const db = adminClient();
  const { data: catalogo } = await db
    .from("ramos_catalogo")
    .select("id")
    .eq("slug", RAMOS_COTIZABLES[ramo].catalogoSlug)
    .maybeSingle();
  if (!catalogo) return NextResponse.json({ error: "Ramo no encontrado en el catálogo" }, { status: 404 });

  const ramoId = catalogo.id as string;
  const existentes = await listCamposPorRamo(db, ctx.organizationId, ramoId);
  if (existentes.length > 0) {
    return NextResponse.json({ campos: existentes });
  }

  const inputs: CreateCampoInput[] = defaults.map(d => ({
    ramoId,
    fieldKey: d.fieldKey,
    label: d.label,
    fieldType: d.fieldType,
    options: d.options,
    pregunta: d.pregunta,
    ayuda: d.ayuda ?? null,
    presentacion: d.presentacion,
    aplicaCotizacion: d.aplicaCotizacion,
    requeridoCotizacion: d.requeridoCotizacion,
    sortOrder: d.sortOrder
  }));

  try {
    const campos = await createCamposBulk(db, ctx.organizationId, inputs);
    return NextResponse.json({ campos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudieron crear los campos" }, { status: 500 });
  }
}
