import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { normalizeRowData } from "@/lib/data-tables/columns";
import { rowLimitError } from "@/lib/data-tables/validate-import";
import type { DataTableColumn, DataTableRowRecord } from "@/types/data-table";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const db = adminClient();
  const { data: table, error: tableErr } = await db
    .from("data_tables")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (tableErr) return NextResponse.json({ error: tableErr.message }, { status: 500 });
  if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const columns = (table.columns ?? []) as DataTableColumn[];
  const normalized = normalizeRowData(body.data ?? {}, columns);
  const now = new Date().toISOString();

  const { count } = await db
    .from("data_table_rows")
    .select("id", { count: "exact", head: true })
    .eq("data_table_id", id);

  const limitErr = rowLimitError(count ?? 0);
  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 400 });

  const { data, error } = await db
    .from("data_table_rows")
    .insert({
      data_table_id: id,
      organization_id: ctx.organizationId,
      data: normalized,
      sort_order: count ?? 0,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("data_tables")
    .update({ row_count: (count ?? 0) + 1, updated_at: now })
    .eq("id", id);

  return NextResponse.json({ row: toRow(data) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const rowId = String(body.row_id ?? "");
  if (!rowId) return NextResponse.json({ error: "row_id requerido" }, { status: 400 });

  const db = adminClient();
  const { data: table } = await db
    .from("data_tables")
    .select("columns")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const columns = (table.columns ?? []) as DataTableColumn[];
  const normalized = normalizeRowData(body.data ?? {}, columns);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("data_table_rows")
    .update({
      data: normalized,
      is_active: body.is_active ?? true,
      updated_at: now,
    })
    .eq("id", rowId)
    .eq("data_table_id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Fila no encontrada" }, { status: 404 });
  return NextResponse.json({ row: toRow(data) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "campaigns", "edit");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const rowId = req.nextUrl.searchParams.get("row_id");
  if (!rowId) return NextResponse.json({ error: "row_id requerido" }, { status: 400 });

  const db = adminClient();
  const { data: table } = await db
    .from("data_tables")
    .select("id, row_count")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!table) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const { error } = await db
    .from("data_table_rows")
    .delete()
    .eq("id", rowId)
    .eq("data_table_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const newCount = Math.max(0, Number(table.row_count ?? 1) - 1);
  await db
    .from("data_tables")
    .update({ row_count: newCount, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
