import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { cotizarSeguroAuto } from "@/lib/insurers/auto-quote-tool";
import { getRamoCampoDefinitionsParaCotizar } from "@/lib/insurers/quote-guidance";

/** Tool de ORI: cotiza un seguro de auto real (Verifik + aseguradora conectada) — nunca precios inventados. */
export const cotizarSeguroAutoTool: OriToolDefinition = {
  name: "cotizar_seguro_auto",
  declaration: {
    name: "cotizar_seguro_auto",
    description:
      "Cotiza un seguro de auto real con la placa del vehículo y los datos del tomador, contra la(s) aseguradora(s) que esta organización tiene conectadas. Úsala cada vez que te pidan cotizar, asegurar o dar el precio de un seguro de auto. Nunca inventes una prima — si la herramienta dice que faltan datos, pídelos uno a uno; si dice que no hay aseguradora conectada o que el cotizador no está listo, dilo tal cual, no des un precio de todas formas.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa del vehículo, sin espacios ni guiones." },
        nuevo_o_usado: { type: Type.STRING, description: 'Uno de: "Nuevo", "Usado".' },
        uso_vehiculo: {
          type: Type.STRING,
          description: 'Uno de: "Particular", "Servicio Público", "Uber/Cabify o similares".'
        },
        importacion_directa: {
          type: Type.STRING,
          description: 'Uno de: "No", "Sí, es de importación directa", "No estoy seguro".'
        },
        tarjeta_propiedad: {
          type: Type.STRING,
          description: 'Uno de: "A mi nombre", "En trámite de traspaso", "A nombre de otra persona".'
        },
        ciudad: { type: Type.STRING, description: "Ciudad donde circula el vehículo." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de la persona que toma la póliza." },
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
    "Tienes una herramienta (cotizar_seguro_auto) para cotizar seguros de auto de verdad. Empieza pidiendo la placa; con eso ya puedes traer los datos del vehículo. Luego necesitas 5 datos más del vehículo: nuevo o usado, uso (particular/servicio público/Uber-Cabify), si es de importación directa, a nombre de quién está la tarjeta de propiedad, y la ciudad donde circula. Para el precio final necesitas además nombre completo, documento y fecha de nacimiento del tomador — pídelos de forma natural, uno o varios a la vez, no como un formulario robótico. Si la herramienta responde que faltan datos, pregunta exactamente por esos. Si responde que no hay aseguradora conectada o que el cotizador aún no está configurado del todo, comunícaselo tal cual al usuario — nunca inventes ni aproximes una prima.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const campos = await getRamoCampoDefinitionsParaCotizar(ctx.db, ctx.organizationId, "autos");
    const result = await cotizarSeguroAuto(
      {
        placa: typeof args.placa === "string" ? args.placa : "",
        nuevo_o_usado: str(args.nuevo_o_usado),
        uso_vehiculo: str(args.uso_vehiculo),
        importacion_directa: str(args.importacion_directa),
        tarjeta_propiedad: str(args.tarjeta_propiedad),
        ciudad: str(args.ciudad),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador)
      },
      ctx,
      // ORI es el copiloto del propio corredor — si él mismo pide la cotización
      // acá, la autonomía completa no tiene el riesgo que sí tiene de cara al
      // cliente final, así que siempre cotiza directo.
      { autoQuote: true, source: "ori" },
      campos
    );
    return { ...result };
  }
};
