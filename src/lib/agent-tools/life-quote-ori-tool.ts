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
        tipo_cobertura: { type: Type.STRING, description: "Qué quiere proteger: vida sola, +invalidez, +enfermedades graves, +renta diaria, o no sabe." },
        suma_asegurada_deseada: { type: Type.STRING, description: "Rango de valor de cobertura deseado." },
        presupuesto_mensual: { type: Type.STRING, description: "Rango de presupuesto mensual aproximado." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        },
        ocupacion: { type: Type.STRING, description: "Ocupación u oficio del tomador." },
        fumador: { type: Type.STRING, description: "Si el tomador fuma o tiene alguna condición médica — Sí/No, obligatorio (determina el riesgo)." },
        interes_ahorro: { type: Type.STRING, description: "Si le interesa un fondo de ahorro con el seguro (opcional)." }
      },
      required: [
        "tipo_cobertura",
        "suma_asegurada_deseada",
        "presupuesto_mensual",
        "fumador",
        "nombre_tomador",
        "documento_tomador",
        "fecha_nacimiento_tomador",
        "ocupacion"
      ]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_vida) para reunir los datos de una cotización de seguro de vida. Pide qué quiere proteger, valor de cobertura deseado, presupuesto mensual, si fuma o tiene alguna condición médica (obligatorio), nombre completo, documento, fecha de nacimiento y ocupación, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const result = await calificarSeguroVida(
      {
        tipo_cobertura: str(args.tipo_cobertura),
        suma_asegurada_deseada: str(args.suma_asegurada_deseada),
        presupuesto_mensual: str(args.presupuesto_mensual),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador),
        ocupacion: str(args.ocupacion),
        fumador: str(args.fumador),
        interes_ahorro: str(args.interes_ahorro)
      },
      ctx,
      { source: "ori" }
    );
    return { ...result };
  }
};
