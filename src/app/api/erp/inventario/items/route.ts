import { NextRequest, NextResponse } from "next/server";
import { requireErpAccess } from "@/lib/erp/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import {
  createInventoryItem,
  findInventoryItemByCodigo,
  listInventoryItems,
  registerInventoryMovement
} from "@/lib/erp/inventory-db";

export async function GET(req: NextRequest) {
  const ctx = await requireErpAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const search = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const db = adminClient();

  try {
    const items = await listInventoryItems(db, ctx.organizationId, { search });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al listar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireErpAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? "").trim();
  const nombre = String(body.nombre ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo es requerido" }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 });

  const stockMinimoRaw = body.stock_minimo;
  const stockMinimo =
    stockMinimoRaw === null || stockMinimoRaw === undefined || stockMinimoRaw === ""
      ? null
      : Number(stockMinimoRaw);
  if (stockMinimo !== null && (!Number.isFinite(stockMinimo) || stockMinimo < 0)) {
    return NextResponse.json({ error: "stock_minimo inválido" }, { status: 400 });
  }

  const existenciaRaw = body.existencia;
  const existencia = existenciaRaw === undefined || existenciaRaw === null ? 0 : Number(existenciaRaw);
  if (!Number.isFinite(existencia)) {
    return NextResponse.json({ error: "existencia inválida" }, { status: 400 });
  }

  const db = adminClient();

  const existing = await findInventoryItemByCodigo(db, ctx.organizationId, codigo);
  if (existing) {
    return NextResponse.json({ error: `Ya existe un producto con el código ${codigo}` }, { status: 409 });
  }

  try {
    let item = await createInventoryItem(db, ctx.organizationId, ctx.userId, {
      codigo,
      nombre,
      marca: body.marca ?? null,
      responsable: body.responsable ?? null,
      stockMinimo
    });

    if (existencia !== 0) {
      const result = await registerInventoryMovement(db, ctx.organizationId, {
        itemId: item.id,
        tipo: "saldo_inicial",
        delta: existencia,
        responsable: body.responsable ?? null,
        nota: "Existencia inicial al crear el producto",
        createdBy: ctx.userId
      });
      item = { ...item, existencia: result.existencia };
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al crear" }, { status: 500 });
  }
}
