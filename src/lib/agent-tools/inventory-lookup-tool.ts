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
    "Tienes una herramienta (consultar_inventario) para ver en tiempo real el inventario de esta empresa: existencias, stock mínimo, marca y responsable por producto. Úsala cada vez que te pregunten por inventario, existencias, qué se está agotando, o listados por producto/marca — nunca respondas esas preguntas de memoria ni inventes cifras. Cuando reportes números, cópialos exactamente como vienen en la respuesta de la herramienta — no los redondees ni los recuerdes de un mensaje anterior.\n\nMUY IMPORTANTE sobre el formato: la plataforma pinta automáticamente una tabla con los productos que devuelve la herramienta, justo debajo de tu mensaje. NUNCA repitas esos productos en tu texto — ni en viñetas, ni numerados, ni en tabla markdown, ni línea por línea. Tu texto debe ser solo una o dos frases de contexto alrededor de la tabla: cuántos encontraste, qué vale la pena destacar (por ejemplo cuáles están bajo mínimo) y qué puede hacer el usuario a continuación. Si `mostrados` es menor que `total_encontrados`, dilo en esa frase (ej. \"te muestro los primeros 20 de 43\") y sugiere que para ver el listado completo revisen la tabla en ERP → Inventario, que sí lo trae completo, ordenable y exportable a Excel. Solo puedes nombrar un producto puntual en el texto cuando la pregunta era por ese producto específico o cuando lo mencionas como excepción dentro de una frase.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const busqueda = typeof args.busqueda === "string" ? args.busqueda.trim() : "";
    const marca = typeof args.marca === "string" ? args.marca.trim().toLowerCase() : "";
    const soloBajoMinimo = args.solo_bajo_minimo === true;
    const limite = Math.min(Math.max(Number(args.limite) || ctx.defaultRowLimit || 15, 1), 30);

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
      // Los filtros viajan de vuelta para que la UI pueda ofrecer "ver el
      // listado completo" con esta misma búsqueda ya aplicada, en vez de
      // obligar al usuario a repetirla (ver toolInventoryListingQuery).
      filtros: {
        busqueda: busqueda || null,
        marca: marca || null,
        solo_bajo_minimo: soloBajoMinimo
      },
      productos
    };
  }
};
