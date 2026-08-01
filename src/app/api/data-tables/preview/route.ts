import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { suggestedRoleMap, validateDataTableImport } from "@/lib/data-tables/validate-import";

/** POST — vista previa de importación Excel (sin guardar) */
export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  try {
    const parsed = parseExcelBuffer(await file.arrayBuffer(), file.name);
    const validation = validateDataTableImport(parsed.rows.length, parsed.columns);
    return NextResponse.json({
      suggested_name: parsed.suggestedName,
      sheet_name: parsed.sheetName,
      columns: parsed.columns,
      row_count: parsed.rows.length,
      sample_rows: parsed.rows.slice(0, 8),
      validation,
      // Precarga del mapeo: lo que la detección automática propone, para que el
      // usuario lo confirme o lo corrija en vez de descubrir el fallo en
      // producción con un precio inventado.
      suggested_roles: suggestedRoleMap(parsed.columns),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el archivo" },
      { status: 400 }
    );
  }
}
