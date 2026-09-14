import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import {
  normalizePolizaRows,
  parsePolizasWorkbook,
  type PolizaColumnMap
} from "@/lib/insurers/polizas-import";
import { upsertPolizaPorNumero, createPoliza } from "@/lib/insurers/polizas-db";
import { findOrCreateContactForPoliza } from "@/lib/insurers/poliza-contact-match";

/**
 * POST — confirma la importación: por cada fila válida, resuelve (o crea) el
 * contacto y crea/actualiza la póliza. Sin numero_poliza no hay forma de
 * deduplicar entre corridas, así que esas filas siempre crean una póliza
 * nueva (se le avisa al usuario en el reporte).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  const columnMapRaw = form.get("column_map");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  let columnMap: PolizaColumnMap;
  try {
    columnMap = JSON.parse(String(columnMapRaw ?? "{}"));
  } catch {
    return NextResponse.json({ error: "column_map inválido" }, { status: 400 });
  }

  let report: ReturnType<typeof normalizePolizaRows>;
  try {
    const { rows } = parsePolizasWorkbook(await file.arrayBuffer());
    report = normalizePolizaRows(rows, columnMap);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }

  const db = adminClient();
  let creadas = 0;
  let actualizadas = 0;
  let contactosCreados = 0;
  const errores: { rowNumber: number; error: string }[] = [];

  for (const row of report.valid) {
    try {
      const match = await findOrCreateContactForPoliza(db, ctx.crmUserId, {
        nombre: row.tomador,
        documento: row.documento,
        telefono: row.telefono,
        fuenteOrigen: "importacion_polizas"
      });
      if (match.created) contactosCreados++;

      const input = {
        contactId: match.contactId,
        aseguradora: row.aseguradora,
        ramo: row.ramo,
        vigenciaDesde: row.vigenciaDesde,
        vigenciaHasta: row.vigenciaHasta,
        prima: row.prima,
        estado: "activa" as const,
        fuente: "excel" as const
      };

      if (row.numeroPoliza) {
        const { created } = await upsertPolizaPorNumero(db, ctx.crmUserId, row.numeroPoliza, input);
        if (created) creadas++;
        else actualizadas++;
      } else {
        await createPoliza(db, ctx.crmUserId, input);
        creadas++;
      }
    } catch (err) {
      errores.push({ rowNumber: row.rowNumber, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  return NextResponse.json({
    creadas,
    actualizadas,
    contactos_creados: contactosCreados,
    missing_required: report.missingRequired,
    invalid_dates: report.invalidDates,
    errores
  });
}
