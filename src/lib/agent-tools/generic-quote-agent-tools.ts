import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { iniciarCotizacionSeguro, registrarDatoCotizacion, type GenericQuoteResult, type PendingFieldInfo } from "@/lib/insurers/generic-quote-tool";
import { RAMOS_COTIZABLES, RAMOS_MOTOR_GENERICO } from "@/lib/insurers/ramos-cotizables";
import { presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";
import type { PolizaCampoFieldType, PolizaCampoPresentacion } from "@/lib/insurers/poliza-ramo-campos-db";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

const RAMOS_GENERICOS_LABEL = RAMOS_MOTOR_GENERICO.map(r => RAMOS_COTIZABLES[r].label).join(", ");

function campoStringOnly(args: Record<string, unknown>): Record<string, string> {
  const campos = args.campos;
  if (!campos || typeof campos !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Convierte el primer campo pendiente (shape ligero de generic-quote-tool.ts) en un RamoCampoDef completo para reusar el mismo determinismo de botones/lista que los ramos con tool dedicada (ver guided-questions.ts). */
function pendingToRamoCampoDef(field: PendingFieldInfo): RamoCampoDef {
  return {
    fieldKey: field.key,
    label: field.label,
    pregunta: field.pregunta || field.label,
    ayuda: field.ayuda,
    fieldType: field.tipo as PolizaCampoFieldType,
    options: field.opciones ?? [],
    sortOrder: 0,
    presentacion: (field.presentacion as PolizaCampoPresentacion) ?? "auto",
    aplicaCotizacion: true,
    requeridoCotizacion: field.requeridoCotizacion !== false
  };
}

/** Manda el primer dato pendiente de forma determinista (botones/lista si aplica) y mezcla pregunta_enviada/siguiente_pregunta en el resultado — mismo contrato que auto-quote-agent-tool.ts y hermanos. */
async function presentNextPending(ctx: AgentToolContext, result: GenericQuoteResult): Promise<AgentToolResult> {
  const siguiente = result.faltan_datos?.[0];
  if (!result.ok || !siguiente) return { ...result };
  const guiado = await presentGuidedQuestion(ctx, pendingToRamoCampoDef(siguiente));
  return { ...result, ...guiado };
}

/**
 * Tools genéricas de calificación para agentes que hablan con el CLIENTE
 * FINAL — un solo par de tools que lee qué preguntar desde poliza_ramo_campos
 * (con fallback a ramo-campos-defaults.ts) para cualquier ramo sin lookup
 * propio. Autos y motos siguen con su propia tool porque consultan
 * Verifik/PlacApi por placa; los ramos con esquema documentado (vida, hogar,
 * SOAT, accidentes personales) también tienen tool propia por ya estar en
 * producción — estas dos cubren todo lo demás (ver RAMOS_MOTOR_GENERICO).
 */
export const iniciarCotizacionSeguroAgentTool: AgentToolDefinition = {
  name: "iniciar_cotizacion_seguro",
  declaration: {
    name: "iniciar_cotizacion_seguro",
    description: `Arranca (o continúa, si ya existe en esta conversación) la cotización de un seguro de ${RAMOS_GENERICOS_LABEL} para el cliente — nunca para autos, motos, vida, hogar, SOAT o accidentes personales, que tienen su propia herramienta. Úsala en cuanto sepas qué ramo quiere el cliente. Devuelve la lista exacta de datos que todavía faltan (con su tipo y, si aplica, sus opciones) — pregúntalos con registrar_dato_cotizacion a medida que el cliente responda.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        ramo: { type: Type.STRING, description: `Ramo a cotizar. Uno de: ${RAMOS_MOTOR_GENERICO.join(", ")}.` },
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
    return (
      `Tienes una herramienta (iniciar_cotizacion_seguro) para arrancar la cotización de un seguro de ${RAMOS_GENERICOS_LABEL} — pásale el ramo apenas lo sepas. ` +
      "Te devuelve exactamente qué dato falta a continuación (con su pregunta y, si aplica, sus opciones) — pregúntalo con registrar_dato_cotizacion en cuanto el cliente responda. " +
      "Si el resultado trae `pregunta_enviada: true`, esa pregunta YA se le envió al cliente (con botones o lista) — no la repitas en tu texto, solo espera la respuesta. " +
      "Si trae `pregunta_enviada: false`, escríbela tú mismo en texto normal usando el valor de `siguiente_pregunta`. Nunca inventes un dato que el cliente no te haya dado. " +
      "Cuando confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo."
    );
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
    return presentNextPending(ctx, result);
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
    return (
      "Tienes una herramienta (registrar_dato_cotizacion) para guardar cada dato que el cliente responda sobre una cotización ya iniciada — pásale el quote_request_id y los campos nuevos. " +
      "Si el resultado trae `pregunta_enviada: true`, la siguiente pregunta YA se le envió al cliente (con botones o lista) — no la repitas en tu texto. " +
      "Si trae `pregunta_enviada: false`, escríbela tú mismo en texto normal usando `siguiente_pregunta`. " +
      "Cuando confirme que ya está completo, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo."
    );
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const quoteRequestId = typeof args.quote_request_id === "string" ? args.quote_request_id : "";
    if (!quoteRequestId) return { ok: false, reason: "Falta el quote_request_id." };
    const result = await registrarDatoCotizacion(ctx.db, ctx.organizationId, quoteRequestId, campoStringOnly(args));
    return presentNextPending(ctx, result);
  }
};
