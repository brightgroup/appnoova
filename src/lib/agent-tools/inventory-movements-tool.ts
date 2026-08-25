import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { findInventoryItemByCodigo, getInventoryItemsByIds, listInventoryMovements } from "@/lib/erp/inventory-db";
import { movementTypeLabel } from "@/components/erp/MovementModal";
import type { InventoryMovementType } from "@/types/erp";

const VALID_TIPOS = new Set<InventoryMovementType>(["entrada", "salida", "ajuste", "saldo_inicial"]);

/** Tool interna de ORI: consulta en vivo el kardex (entradas/salidas/ajustes) — nunca datos inventados. */
export const inventoryMovementsTool: OriToolDefinition = {
  name: "consultar_movimientos_inventario",
  declaration: {
    name: "consultar_movimientos_inventario",
    description:
      "Consulta en tiempo real el historial real de entradas, salidas y ajustes de inventario (kardex), más recientes primero. Úsala para preguntas sobre qué se movió, el historial de un producto específico, o quién registró un cambio. Nunca inventes movimientos ni cifras — si no encuentra nada, dilo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        codigo: {
          type: Type.STRING,
          description: "Código exacto de un producto, para ver solo su kardex. Vacío para ver movimientos de todos los productos."
        },
        tipo: {
          type: Type.STRING,
          description: "Filtrar por tipo de movimiento. Vacío para todos.",
          enum: ["entrada", "salida", "ajuste", "saldo_inicial"]
        },
        limite: {
          type: Type.INTEGER,
          description: "Máximo de movimientos a devolver, más recientes primero. Por defecto 15, máximo 30."
        }
      }
    }
  },
  promptBlock:
    "Tienes una herramienta (consultar_movimientos_inventario) para ver el kardex real: entradas, salidas y ajustes, con fecha, cantidad, saldo resultante y quién lo registró. Úsala para cualquier pregunta sobre movimientos o historial de inventario — nunca la inventes ni la deduzcas de memoria.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const codigo = typeof args.codigo === "string" ? args.codigo.trim() : "";
    const tipoRaw = typeof args.tipo === "string" ? args.tipo.trim() : "";
    const tipo = VALID_TIPOS.has(tipoRaw as InventoryMovementType) ? (tipoRaw as InventoryMovementType) : null;
    const limite = Math.min(Math.max(Number(args.limite) || 15, 1), 30);

    let itemId: string | undefined;
    let itemLabel: string | null = null;
    if (codigo) {
      const item = await findInventoryItemByCodigo(ctx.db, ctx.organizationId, codigo);
      if (!item) {
        return { ok: true, encontrado: false, mensaje: `No existe ningún producto con código "${codigo}" en el inventario.` };
      }
      itemId = item.id;
      itemLabel = `${item.codigo} — ${item.nombre}`;
    }

    const all = await listInventoryMovements(ctx.db, ctx.organizationId, { itemId, limit: 200 });
    const filtered = tipo ? all.filter(m => m.tipo === tipo) : all;
    const page = filtered.slice(0, limite);

    const labelById = new Map<string, string>();
    if (!itemId) {
      const uniqueIds = [...new Set(page.map(m => m.itemId))];
      const items = await getInventoryItemsByIds(ctx.db, ctx.organizationId, uniqueIds);
      for (const i of items) labelById.set(i.id, `${i.codigo} — ${i.nombre}`);
    }

    const movimientos = page.map(m => ({
      producto: itemLabel ?? labelById.get(m.itemId) ?? m.itemId,
      fecha: m.fecha,
      tipo: movementTypeLabel(m.tipo),
      cantidad: m.delta,
      saldo_resultante: m.existenciaResultante,
      responsable: m.responsable,
      registrado_por: m.createdByLabel ?? null,
      nota: m.nota
    }));

    return {
      ok: true,
      encontrado: true,
      total_encontrados: filtered.length,
      mostrados: movimientos.length,
      hay_mas_de_los_mostrados: filtered.length > movimientos.length,
      movimientos
    };
  }
};
