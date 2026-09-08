import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { parsePolizasWorkbook, suggestPolizaColumnMap } from "@/lib/insurers/polizas-import";

/** POST — vista previa de importación de cartera (sin guardar). */
export async function POST(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "edit");
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  try {
    const { headers, rows } = parsePolizasWorkbook(await file.arrayBuffer());
    return NextResponse.json({
      headers,
      row_count: rows.length,
      sample_rows: rows.slice(0, 8),
      suggested_map: suggestPolizaColumnMap(headers)
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }
}
