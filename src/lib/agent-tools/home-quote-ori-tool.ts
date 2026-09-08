import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { calificarSeguroHogar } from "@/lib/insurers/home-quote-tool";

/** Tool de ORI: reúne los datos de un seguro de hogar — siempre cola humana, no hay conector de aseguradora para hogar todavía. */
export const calificarSeguroHogarOriTool: OriToolDefinition = {
  name: "cotizar_seguro_hogar",
  declaration: {
    name: "cotizar_seguro_hogar",
    description:
      "Reúne los datos para cotizar un seguro de hogar. No da un precio directo — deja la solicitud lista para que un asesor la cotice. Nunca inventes una prima.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        direccion_inmueble: { type: Type.STRING, description: "Dirección del inmueble a asegurar." },
        tipo_inmueble: { type: Type.STRING, description: "Tipo de inmueble: casa o apartamento." },
        estrato: { type: Type.STRING, description: "Estrato socioeconómico del inmueble." },
        valor_aproximado_inmueble: {
          type: Type.STRING,
          description: "Valor aproximado del inmueble, en pesos colombianos."
        }
      },
      required: ["nombre_tomador", "documento_tomador", "direccion_inmueble", "tipo_inmueble", "estrato", "valor_aproximado_inmueble"]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_hogar) para reunir los datos de una cotización de seguro de hogar. Pide nombre completo, documento, dirección del inmueble, tipo (casa o apartamento), estrato y valor aproximado, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const result = await calificarSeguroHogar(
      {
        nombre_tomador: typeof args.nombre_tomador === "string" ? args.nombre_tomador : undefined,
        documento_tomador: typeof args.documento_tomador === "string" ? args.documento_tomador : undefined,
        direccion_inmueble: typeof args.direccion_inmueble === "string" ? args.direccion_inmueble : undefined,
        tipo_inmueble: typeof args.tipo_inmueble === "string" ? args.tipo_inmueble : undefined,
        estrato: typeof args.estrato === "string" ? args.estrato : undefined,
        valor_aproximado_inmueble:
          typeof args.valor_aproximado_inmueble === "string" ? args.valor_aproximado_inmueble : undefined
      },
      ctx,
      { source: "ori" }
    );
    return { ...result };
  }
};
