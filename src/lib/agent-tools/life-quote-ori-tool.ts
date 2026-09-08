import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { calificarSeguroVida } from "@/lib/insurers/life-quote-tool";

/** Tool de ORI: reúne los datos de un seguro de vida — siempre cola humana, no hay conector de aseguradora para vida todavía. */
export const calificarSeguroVidaOriTool: OriToolDefinition = {
  name: "cotizar_seguro_vida",
  declaration: {
    name: "cotizar_seguro_vida",
    description:
      "Reúne los datos para cotizar un seguro de vida. No da un precio directo — deja la solicitud lista para que un asesor la cotice. Nunca inventes una prima.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        },
        ocupacion: { type: Type.STRING, description: "Ocupación u oficio del tomador." },
        suma_asegurada_deseada: {
          type: Type.STRING,
          description: "Suma asegurada aproximada deseada, en pesos colombianos."
        },
        fumador: { type: Type.STRING, description: "Si el tomador fuma o no (opcional)." }
      },
      required: ["nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador", "ocupacion", "suma_asegurada_deseada"]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_vida) para reunir los datos de una cotización de seguro de vida. Pide nombre completo, documento, fecha de nacimiento, ocupación y suma asegurada deseada, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const result = await calificarSeguroVida(
      {
        nombre_tomador: typeof args.nombre_tomador === "string" ? args.nombre_tomador : undefined,
        documento_tomador: typeof args.documento_tomador === "string" ? args.documento_tomador : undefined,
        fecha_nacimiento_tomador:
          typeof args.fecha_nacimiento_tomador === "string" ? args.fecha_nacimiento_tomador : undefined,
        ocupacion: typeof args.ocupacion === "string" ? args.ocupacion : undefined,
        suma_asegurada_deseada:
          typeof args.suma_asegurada_deseada === "string" ? args.suma_asegurada_deseada : undefined,
        fumador: typeof args.fumador === "string" ? args.fumador : undefined
      },
      ctx,
      { source: "ori" }
    );
    return { ...result };
  }
};
