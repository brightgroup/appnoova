import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { parseInventoryWorkbook, suggestInventoryColumnMap } from "@/lib/erp/import";

/** POST — vista previa de importación del maestro de inventario (sin guardar). */
export async function POST(req: NextRequest) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  try {
    const { headers, rows } = parseInventoryWorkbook(await file.arrayBuffer());
    return NextResponse.json({
      headers,
      row_count: rows.length,
      sample_rows: rows.slice(0, 8),
      suggested_map: suggestInventoryColumnMap(headers)
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }
}
