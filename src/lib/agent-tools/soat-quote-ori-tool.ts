import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { calificarSoat } from "@/lib/insurers/soat-quote-tool";

/** Tool de ORI: reúne los datos de un SOAT — siempre cola humana. */
export const calificarSoatOriTool: OriToolDefinition = {
  name: "cotizar_seguro_soat",
  declaration: {
    name: "cotizar_seguro_soat",
    description:
      "Reúne los datos para cotizar un SOAT. No da un precio directo — deja la solicitud lista para que un asesor la cotice. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa del vehículo." },
        motor_ultimos_digitos: { type: Type.STRING, description: "Últimos 4 dígitos del número de motor." },
        ciudad: { type: Type.STRING, description: "Ciudad donde circula el vehículo." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: ["placa", "motor_ultimos_digitos", "ciudad", "nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador"]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_soat) para reunir los datos de un SOAT. Pide placa, últimos 4 dígitos del motor, ciudad, nombre completo, documento y fecha de nacimiento, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const result = await calificarSoat(
      {
        placa: str(args.placa),
        motor_ultimos_digitos: str(args.motor_ultimos_digitos),
        ciudad: str(args.ciudad),
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
