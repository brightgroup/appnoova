import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { validateDataTableImport } from "@/lib/data-tables/validate-import";
import type { DataTableColumn, DataTableRecord, DataTableRowRecord } from "@/types/data-table";

function toTable(raw: Record<string, unknown>): DataTableRecord {
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

function toRow(raw: Record<string, unknown>): DataTableRowRecord {
  return {
    id: String(raw.id),
    data_table_id: String(raw.data_table_id),
    organization_id: String(raw.organization_id),
    data: (raw.data ?? {}) as DataTableRowRecord["data"],
    sort_order: Number(raw.sort_order ?? 0),
    is_active: Boolean(raw.is_active ?? true),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

async function getTable(db: ReturnType<typeof adminClient>, orgId: string, id: string) {
  const { data, error } = await db
    .from("data_tables")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "view");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const db = adminClient();
  try {
    const table = await getTable(db, ctx.organizationId, id);
    if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

    const { data: rows, error: rowsErr } = await db
      .from("data_table_rows")
      .select("*")
      .eq("data_table_id", id)
      .order("sort_order", { ascending: true });

    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

    const { data: linkedAgents } = await db
      .from("text_agents")
      .select("id, name")
      .eq("data_table_id", id);

    return NextResponse.json({
      table: toTable(table),
      rows: (rows ?? []).map(r => toRow(r)),
      linked_agents: linkedAgents ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name != null) updates.name = String(body.name).trim();
  if (body.description != null) updates.description = body.description ? String(body.description) : null;
  if (Array.isArray(body.columns)) updates.columns = body.columns;

  const db = adminClient();
  const { data, error } = await db
    .from("data_tables")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });
  return NextResponse.json({ table: toTable(data) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(_req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const db = adminClient();
  await db.from("text_agents").update({ data_table_id: null }).eq("data_table_id", id);

  const { error } = await db
    .from("data_tables")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Reimportar Excel — reemplaza filas */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const db = adminClient();
  const table = await getTable(db, ctx.organizationId, id);
  if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  let parsed;
  try {
    parsed = parseExcelBuffer(await file.arrayBuffer(), file.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el Excel" },
      { status: 400 }
    );
  }

  const importCheck = validateDataTableImport(parsed.rows.length, parsed.columns);
  if (!importCheck.ok) {
    return NextResponse.json({ error: importCheck.error }, { status: 400 });
  }

  const columns = parsed.columns as DataTableColumn[];
  const now = new Date().toISOString();

  await db.from("data_table_rows").delete().eq("data_table_id", id);

  const rowInserts = parsed.rows.map((data, i) => ({
    data_table_id: id,
    organization_id: ctx.organizationId,
    data,
    sort_order: i,
    updated_at: now,
  }));

  const { error: rowsErr } = await db.from("data_table_rows").insert(rowInserts);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const { data: updated, error: updErr } = await db
    .from("data_tables")
    .update({
      columns,
      row_count: parsed.rows.length,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ table: toTable(updated), imported_rows: parsed.rows.length });
}
