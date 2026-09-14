import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { calificarAccidentesPersonales } from "@/lib/insurers/accident-quote-tool";

/** Tool de ORI: reúne los datos de un seguro de Accidentes Personales — siempre cola humana. */
export const calificarAccidentesOriTool: OriToolDefinition = {
  name: "cotizar_seguro_accidentes",
  declaration: {
    name: "cotizar_seguro_accidentes",
    description:
      "Reúne los datos para cotizar un seguro de Accidentes Personales. No da un precio directo — deja la solicitud lista para que un asesor la cotice. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        proteccion_deseada: { type: Type.STRING, description: "Qué quiere proteger: muerte accidental, invalidez, renta diaria, todas, o no sabe." },
        tipo_poliza: { type: Type.STRING, description: "Individual o póliza colectiva." },
        valor_cobertura: { type: Type.STRING, description: "Rango de valor de cobertura deseado." },
        ya_tiene_seguro: { type: Type.STRING, description: "Si ya tiene un seguro de accidentes personales." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: [
        "proteccion_deseada",
        "tipo_poliza",
        "valor_cobertura",
        "ya_tiene_seguro",
        "nombre_tomador",
        "documento_tomador",
        "fecha_nacimiento_tomador"
      ]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_accidentes) para reunir los datos de un seguro de Accidentes Personales. Pide qué quiere proteger, individual o colectiva, valor de cobertura, si ya tiene un seguro similar, nombre, documento y fecha de nacimiento, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const result = await calificarAccidentesPersonales(
      {
        proteccion_deseada: str(args.proteccion_deseada),
        tipo_poliza: str(args.tipo_poliza),
        valor_cobertura: str(args.valor_cobertura),
        ya_tiene_seguro: str(args.ya_tiene_seguro),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador)
      },
      ctx,
      { source: "ori" }
    );
    return { ...result };
  }
};
