import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSeguroMoto } from "@/lib/insurers/moto-quote-tool";

/** Tool de calificación de seguro de motos para agentes que hablan con el CLIENTE FINAL — mismo patrón de vehículo que auto-quote-agent-tool.ts, sin cotización real. */
export const calificarSeguroMotoAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_moto",
  declaration: {
    name: "cotizar_seguro_moto",
    description:
      "Reúne los datos para cotizar un seguro de moto (no da el precio directo — lo confirma un asesor), consultando la placa para traer los datos del vehículo automáticamente. Úsala cada vez que el cliente pida cotizar, asegurar o preguntar el precio de un seguro de moto. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa de la moto, sin espacios ni guiones." },
        nuevo_o_usado: { type: Type.STRING, description: 'Uno de: "Nuevo", "Usado".' },
        uso_vehiculo: {
          type: Type.STRING,
          description: 'Uno de: "Particular", "Servicio Público", "Uber/Cabify o similares".'
        },
        importacion_directa: {
          type: Type.STRING,
          description: 'Uno de: "No", "Sí, es de importación directa", "No estoy seguro".'
        },
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
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return 'Tienes una herramienta (cotizar_seguro_moto) para REUNIR los datos de una cotización de moto (no da el precio directo — eso lo confirma un asesor). Pide la placa primero — con eso ya traes marca, línea y año automáticamente. Luego, con botones (usa presentar_opciones_whatsapp con estas opciones EXACTAS): ¿nueva o usada? ("Nuevo"/"Usado"); ¿qué uso tiene? ("Particular"/"Servicio Público"/"Uber/Cabify o similares"); ¿es de importación directa? ("No"/"Sí, es de importación directa"/"No estoy seguro"). La ciudad, en texto normal. Luego pide nombre completo, documento y fecha de nacimiento del tomador. Si la herramienta dice que faltan datos, pide exactamente esos. Cuando confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes un precio tú mismo.';
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
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
      {
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      }
    );
    return { ...result };
  }
};
