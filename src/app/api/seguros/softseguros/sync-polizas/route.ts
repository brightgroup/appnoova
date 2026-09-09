import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { getSoftsegurosCredentials, markSoftsegurosSynced, markSoftsegurosConnectionResult } from "@/lib/softseguros/connections-db";
import { listPolizasTodas, SoftsegurosApiError } from "@/lib/softseguros/client";
import { mapSoftsegurosPoliza } from "@/lib/softseguros/poliza-mapper";
import { upsertPolizaPorNumero, findRamoCatalogoPorNombre } from "@/lib/insurers/polizas-db";
import { findOrCreateContactForPoliza } from "@/lib/insurers/poliza-contact-match";

/**
 * POST — trae toda la cartera desde Softseguros y la refleja en `polizas`.
 * Solo lectura hacia Softseguros (Camino A del plan maestro): Noova nunca
 * escribe pólizas allá, la carga de producción sigue siendo manual en
 * Softseguros, como confirmó el corredor real que ya la usa.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const credentials = await getSoftsegurosCredentials(db, ctx.organizationId);
  if (!credentials) {
    return NextResponse.json({ error: "Softseguros no está conectado para esta organización" }, { status: 400 });
  }

  let rawPolizas: Record<string, unknown>[];
  try {
    rawPolizas = await listPolizasTodas(credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error consultando pólizas en Softseguros";
    await markSoftsegurosConnectionResult(db, ctx.organizationId, { ok: false, message });
    const status = err instanceof SoftsegurosApiError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  let creadas = 0;
  let actualizadas = 0;
  let contactosCreados = 0;
  const sinFechaVencimiento: string[] = [];
  const errores: { softsegurosId: string; error: string }[] = [];
  const ramoIdCache = new Map<string, string | null>();

  for (const raw of rawPolizas) {
    const mapped = mapSoftsegurosPoliza(raw);
    if (mapped.ok === false) {
      errores.push({ softsegurosId: String(raw.id ?? "?"), error: mapped.motivo });
      continue;
    }
    const p = mapped.poliza;

    try {
      const match = await findOrCreateContactForPoliza(db, ctx.crmUserId, {
        nombre: p.cliente.nombre,
        documento: p.cliente.documento,
        telefono: null,
        fuenteOrigen: "softseguros"
      });
      if (match.created) contactosCreados++;

      let ramoId: string | null = null;
      if (p.ramoGlobalNombre) {
        if (!ramoIdCache.has(p.ramoGlobalNombre)) {
          ramoIdCache.set(p.ramoGlobalNombre, await findRamoCatalogoPorNombre(db, p.ramoGlobalNombre));
        }
        ramoId = ramoIdCache.get(p.ramoGlobalNombre) ?? null;
      }

      const { created } = await upsertPolizaPorNumero(db, ctx.crmUserId, p.numeroPoliza, {
        contactId: match.contactId,
        aseguradora: p.aseguradora,
        ramo: p.ramo,
        ramoId,
        vigenciaDesde: p.vigenciaDesde,
        vigenciaHasta: p.vigenciaHasta,
        prima: p.prima,
        estado: p.estado,
        tipoPoliza: p.tipoPoliza,
        moneda: p.moneda,
        tasaCambio: p.tasaCambio,
        esSoat: p.esSoat,
        aseguradoNombre: p.asegurado?.nombre ?? null,
        aseguradoDocumento: p.asegurado?.documento ?? null,
        comisionAgencia: p.comisionAgencia,
        porcentajeComisionAgencia: p.porcentajeComisionAgencia,
        comisionVendedor: p.comisionVendedor,
        porcentajeComisionVendedor: p.porcentajeComisionVendedor,
        fuente: "softseguros",
        metadata: { softseguros_id: p.softsegurosId }
      });
      if (created) creadas++;
      else actualizadas++;

      if (!p.vigenciaHasta) sinFechaVencimiento.push(p.numeroPoliza);
    } catch (err) {
      errores.push({ softsegurosId: p.softsegurosId, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  await markSoftsegurosSynced(db, ctx.organizationId);

  return NextResponse.json({
    total_softseguros: rawPolizas.length,
    creadas,
    actualizadas,
    contactos_creados: contactosCreados,
    sin_fecha_vencimiento: sinFechaVencimiento,
    errores
  });
}
