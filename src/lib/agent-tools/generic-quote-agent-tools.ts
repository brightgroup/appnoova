import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { iniciarCotizacionSeguro, registrarDatoCotizacion } from "@/lib/insurers/generic-quote-tool";
import { RAMOS_COTIZABLES } from "@/lib/insurers/ramos-cotizables";

const RAMOS_GENERICOS_LABEL = ["vida", "hogar", "salud"].map(r => RAMOS_COTIZABLES[r as keyof typeof RAMOS_COTIZABLES].label).join(", ");

function campoStringOnly(args: Record<string, unknown>): Record<string, string> {
  const campos = args.campos;
  if (!campos || typeof campos !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * Tool genérica de calificación para agentes que hablan con el CLIENTE FINAL
 * — reemplaza cotizar_seguro_vida/cotizar_seguro_hogar (un tool por ramo) por
 * una sola que lee qué preguntar desde poliza_ramo_campos. Autos sigue con su
 * propia tool (cotizar_seguro_auto) porque su flujo es distinto (placa +
 * consulta real a Verifik/PlacApi, no un formulario).
 */
export const iniciarCotizacionSeguroAgentTool: AgentToolDefinition = {
  name: "iniciar_cotizacion_seguro",
  declaration: {
    name: "iniciar_cotizacion_seguro",
    description: `Arranca (o continúa, si ya existe en esta conversación) la cotización de un seguro de ${RAMOS_GENERICOS_LABEL} para el cliente — nunca para autos, que usa cotizar_seguro_auto. Úsala en cuanto sepas qué ramo quiere el cliente. Devuelve la lista exacta de datos que todavía faltan (con su tipo y, si aplica, sus opciones) — pregúntalos con registrar_dato_cotizacion a medida que el cliente responda.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        ramo: { type: Type.STRING, description: "Ramo a cotizar: vida, hogar o salud." },
        campos: {
          type: Type.OBJECT,
          description: "Datos que el cliente ya haya dado en la conversación (opcional) — clave/valor, ej. {\"nombre_tomador\": \"Ana Pérez\"}."
        }
      },
      required: ["ramo"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return `Tienes una herramienta (iniciar_cotizacion_seguro) para arrancar la cotización de un seguro de ${RAMOS_GENERICOS_LABEL} — pásale el ramo apenas lo sepas. Te devuelve exactamente qué datos faltan (con su tipo y opciones si es de elegir) — pregúntalos de forma natural, uno o dos a la vez, y guárdalos con registrar_dato_cotizacion. Para un campo con opciones, usa presentar_opciones_whatsapp en vez de escribirlas en texto plano. Nunca inventes un dato que el cliente no te haya dado.`;
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const ramo = typeof args.ramo === "string" ? args.ramo : "";
    const result = await iniciarCotizacionSeguro(
      ctx.db,
      ctx.organizationId,
      { ramo, campos: campoStringOnly(args) },
      {
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      }
    );
    return { ...result };
  }
};

export const registrarDatoCotizacionAgentTool: AgentToolDefinition = {
  name: "registrar_dato_cotizacion",
  declaration: {
    name: "registrar_dato_cotizacion",
    description:
      "Guarda una o más respuestas del cliente para una cotización ya iniciada con iniciar_cotizacion_seguro. Devuelve qué sigue faltando, o confirma que los datos quedaron completos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        quote_request_id: { type: Type.STRING, description: "Id de la cotización, devuelto por iniciar_cotizacion_seguro." },
        campos: {
          type: Type.OBJECT,
          description: "Clave/valor de los datos que el cliente acaba de responder, ej. {\"estrato\": \"3\"}."
        }
      },
      required: ["quote_request_id", "campos"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return "Tienes una herramienta (registrar_dato_cotizacion) para guardar cada dato que el cliente responda sobre una cotización ya iniciada — pásale el quote_request_id y los campos nuevos. Cuando confirme que ya está completo, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const quoteRequestId = typeof args.quote_request_id === "string" ? args.quote_request_id : "";
    if (!quoteRequestId) return { ok: false, reason: "Falta el quote_request_id." };
    const result = await registrarDatoCotizacion(ctx.db, ctx.organizationId, quoteRequestId, campoStringOnly(args));
    return { ...result };
  }
};
