import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { validateDataTableImport } from "@/lib/data-tables/validate-import";
import { applyColumnRolesFromForm } from "@/lib/data-tables/column-roles";
import type { DataTableRecord } from "@/types/data-table";

function toRecord(raw: Record<string, unknown>): DataTableRecord {
  return {
    id: String(raw.id),
    organization_id: String(raw.organization_id),
    user_id: String(raw.user_id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : null,
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    row_count: Number(raw.row_count ?? 0),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "campaigns", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data, error } = await db
    .from("data_tables")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tables: (data ?? []).map(r => toRecord(r)) });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const nameOverride = String(form.get("name") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    let parsed;
    try {
      parsed = parseExcelBuffer(buffer, file.name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo leer el Excel" },
        { status: 400 }
      );
    }

    // El mapeo que confirmó el usuario en el importador manda sobre la
    // detección automática; si no llega ninguno, las columnas quedan sin rol y
    // el sistema sigue adivinando como hasta ahora.
    const columns = applyColumnRolesFromForm(parsed.columns, form.get("column_roles"));

    const importCheck = validateDataTableImport(parsed.rows.length, columns);
    if (!importCheck.ok) {
      return NextResponse.json({ error: importCheck.error }, { status: 400 });
    }

    const db = adminClient();
    const now = new Date().toISOString();
    const tableName = nameOverride || parsed.suggestedName;

    const { data: table, error: tableErr } = await db
      .from("data_tables")
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        name: tableName,
        description: `Importado desde ${file.name}`,
        columns,
        row_count: parsed.rows.length,
        updated_at: now,
      })
      .select("*")
      .single();

    if (tableErr || !table) {
      return NextResponse.json({ error: tableErr?.message ?? "Error al crear tabla" }, { status: 500 });
    }

    const rowInserts = parsed.rows.map((data, i) => ({
      data_table_id: table.id,
      organization_id: ctx.organizationId,
      data,
      sort_order: i,
      updated_at: now,
    }));

    const { error: rowsErr } = await db.from("data_table_rows").insert(rowInserts);
    if (rowsErr) {
      await db.from("data_tables").delete().eq("id", table.id);
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    return NextResponse.json({ table: toRecord(table), imported_rows: parsed.rows.length });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });

  const db = adminClient();
  const { data, error } = await db
    .from("data_tables")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      name,
      description: body.description ? String(body.description) : null,
      columns: Array.isArray(body.columns) ? body.columns : [],
      row_count: 0,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: toRecord(data) });
}
