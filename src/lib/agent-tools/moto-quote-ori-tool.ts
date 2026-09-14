import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { calificarSeguroMoto } from "@/lib/insurers/moto-quote-tool";

/** Tool de ORI: reúne los datos de un seguro de moto — siempre cola humana, no hay conector de aseguradora para motos todavía. */
export const calificarSeguroMotoOriTool: OriToolDefinition = {
  name: "cotizar_seguro_moto",
  declaration: {
    name: "cotizar_seguro_moto",
    description:
      "Reúne los datos para cotizar un seguro de moto, consultando la placa para traer los datos del vehículo. No da un precio directo — deja la solicitud lista para que un asesor la cotice. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa de la moto." },
        nuevo_o_usado: { type: Type.STRING, description: "Nueva o usada." },
        uso_vehiculo: { type: Type.STRING, description: "Uso: particular, servicio público, o Uber/Cabify." },
        importacion_directa: { type: Type.STRING, description: "Si es de importación directa." },
        ciudad: { type: Type.STRING, description: "Ciudad donde circula la moto." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: ["placa"]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro_moto) para reunir los datos de un seguro de moto. Empieza pidiendo la placa; con eso ya traes los datos del vehículo. Luego pide nuevo o usado, uso, importación directa, ciudad, nombre, documento y fecha de nacimiento del tomador, de forma natural. No da el precio directo — cuando confirme que los datos quedaron completos, dile al usuario que un asesor confirmará el precio.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const result = await calificarSeguroMoto(
      {
        placa: typeof args.placa === "string" ? args.placa : "",
        nuevo_o_usado: str(args.nuevo_o_usado),
        uso_vehiculo: str(args.uso_vehiculo),
        importacion_directa: str(args.importacion_directa),
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
