import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";

/** POST — vista previa Excel para audiencia de campaña (sin guardar) */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  try {
    const parsed = parseExcelBuffer(await file.arrayBuffer(), file.name);
    return NextResponse.json({
      suggested_name: parsed.suggestedName,
      sheet_name: parsed.sheetName,
      columns: parsed.columns,
      row_count: parsed.rows.length,
      sample_rows: parsed.rows.slice(0, 8),
      column_labels: parsed.headers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }
}
