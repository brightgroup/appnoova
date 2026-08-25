import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { listInventoryItems } from "@/lib/erp/inventory-db";
import { isLowStock } from "@/types/erp";

/** Tool interna de ORI: consulta en vivo el inventario de ERP de la organización — nunca datos inventados. */
export const inventoryLookupTool: OriToolDefinition = {
  name: "consultar_inventario",
  declaration: {
    name: "consultar_inventario",
    description:
      "Consulta en tiempo real el inventario de productos de esta empresa (código, marca, responsable, existencia y stock mínimo). Úsala para responder preguntas sobre existencias, qué productos se están agotando, o listados por marca o producto. Nunca inventes cifras de inventario — si no tienes la tool disponible o no encuentra el producto, dilo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        busqueda: {
          type: Type.STRING,
          description: "Texto libre para buscar por código, nombre o marca. Vacío para no filtrar por texto."
        },
        marca: {
          type: Type.STRING,
          description: "Filtrar por marca exacta. Vacío para no filtrar por marca."
        },
        solo_bajo_minimo: {
          type: Type.BOOLEAN,
          description: "true para traer solo productos en su stock mínimo o por debajo (los que se están agotando)."
        },
        limite: {
          type: Type.INTEGER,
          description: "Máximo de productos a devolver. Por defecto 15, máximo 30 — para listados más grandes, dirige al usuario a la tabla de Inventario."
        }
      }
    }
  },
  promptBlock:
    "Tienes una herramienta (consultar_inventario) para ver en tiempo real el inventario de esta empresa: existencias, stock mínimo, marca y responsable por producto. Úsala cada vez que te pregunten por inventario, existencias, qué se está agotando, o listados por producto/marca — nunca respondas esas preguntas de memoria ni inventes cifras. Cuando reportes números, cópialos exactamente como vienen en la respuesta de la herramienta — no los redondees ni los recuerdes de un mensaje anterior. Si `mostrados` es menor que `total_encontrados`, dilo explícitamente (ej. \"te muestro los primeros 20 de 43\") y sugiere que para ver el listado completo revisen la tabla en ERP → Inventario, que sí lo trae completo, ordenable y exportable a Excel.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const busqueda = typeof args.busqueda === "string" ? args.busqueda.trim() : "";
    const marca = typeof args.marca === "string" ? args.marca.trim().toLowerCase() : "";
    const soloBajoMinimo = args.solo_bajo_minimo === true;
    const limite = Math.min(Math.max(Number(args.limite) || 15, 1), 30);

    const items = await listInventoryItems(ctx.db, ctx.organizationId, { search: busqueda || undefined });

    let filtered = items;
    if (marca) filtered = filtered.filter(i => i.marca?.trim().toLowerCase() === marca);
    if (soloBajoMinimo) filtered = filtered.filter(isLowStock);

    const productos = filtered.slice(0, limite).map(i => ({
      codigo: i.codigo,
      nombre: i.nombre,
      marca: i.marca,
      responsable: i.responsable,
      existencia: i.existencia,
      stock_minimo: i.stockMinimo,
      bajo_minimo: isLowStock(i)
    }));

    return {
      ok: true,
      total_encontrados: filtered.length,
      mostrados: productos.length,
      productos
    };
  }
};
