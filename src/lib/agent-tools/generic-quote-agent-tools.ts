import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { cotizarSeguroGenerico, type GenericQuoteResult, type PendingFieldInfo } from "@/lib/insurers/generic-quote-tool";
import { RAMOS_COTIZABLES, RAMOS_MOTOR_GENERICO } from "@/lib/insurers/ramos-cotizables";
import { presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";
import type { PolizaCampoFieldType, PolizaCampoPresentacion } from "@/lib/insurers/poliza-ramo-campos-db";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";
import { resolveQuoteSource } from "@/lib/widget-channel";

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
 * Tool ÚNICA de calificación para agentes que hablan con el CLIENTE FINAL —
 * cubre cualquier ramo sin lookup propio, leyendo qué preguntar desde
 * poliza_ramo_campos (con fallback a ramo-campos-defaults.ts). Autos y motos
 * siguen con su propia tool porque consultan Verifik/PlacApi por placa; los
 * ramos con esquema documentado que ya estaban en producción (vida, hogar,
 * SOAT, accidentes personales) también tienen tool propia — esta cubre todo
 * lo demás (ver RAMOS_MOTOR_GENERICO).
 *
 * DISEÑO 2026-09-15 (v2): antes eran dos tools (`iniciar_cotizacion_seguro` +
 * `registrar_dato_cotizacion`, guardado incremental) — resultó no ser
 * confiable: el modelo las llamaba una sola vez y seguía la conversación de
 * memoria sin volver a guardar nada (ver docs/HANDOFF-CAMPOS-COTIZACION-CONFIGURABLES.md
 * para la evidencia). Ahora es UNA sola tool que el modelo debe llamar en
 * cada turno con TODOS los campos que ya conoce — mismo patrón que ya
 * funciona bien en los 6 ramos con tool dedicada (auto-quote-agent-tool.ts y
 * hermanos: schema fijo, el modelo reenvía todo lo que sabe en cada llamada).
 */
export const cotizarSeguroAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro",
  declaration: {
    name: "cotizar_seguro",
    description: `Reúne los datos para cotizar un seguro de ${RAMOS_GENERICOS_LABEL} para el cliente (no da el precio directo — lo confirma un asesor) — nunca para autos, motos, vida, hogar, SOAT o accidentes personales, que tienen su propia herramienta. Llama esta herramienta en CADA turno de la conversación, apenas el cliente diga qué ramo quiere o responda cualquier dato — pasando el ramo y TODOS los campos que ya conoces de esta cotización hasta ahora (no solo el más reciente, también los que ya habías enviado en llamadas anteriores). Devuelve la lista exacta de datos que todavía faltan (con su tipo y, si aplica, sus opciones). Nunca inventes un dato que el cliente no te haya dado.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        ramo: { type: Type.STRING, description: `Ramo a cotizar. Uno de: ${RAMOS_MOTOR_GENERICO.join(", ")}.` },
        campos: {
          type: Type.OBJECT,
          description:
            "TODOS los datos que el cliente ya te ha dado en esta cotización hasta ahora — clave/valor, ej. {\"nombre_tomador\": \"Ana Pérez\", \"estrato\": \"3\"}. Incluye los que ya habías enviado antes, no solo el más nuevo; si no lo incluyes aquí, no queda guardado. Cada clave debe ser EXACTAMENTE el `key` que la herramienta te devolvió en `faltan_datos` para ese dato — nunca inventes, abrevies ni cambies el nombre de una clave; si usas una clave distinta a la que te dieron, esa respuesta no se reconoce como guardada aunque el dato sí llegue al servidor."
        }
      },
      required: ["ramo", "campos"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return (
      `Tienes una herramienta (cotizar_seguro) para reunir los datos de una cotización de ${RAMOS_GENERICOS_LABEL} — no da el precio directo, eso lo confirma un asesor. ` +
      "Apenas sepas qué ramo quiere el cliente, llámala con el ramo (y los campos que ya tengas, aunque sea ninguno todavía). Te devuelve exactamente qué dato falta a continuación (con su pregunta y, si aplica, sus opciones). " +
      "REGLA SIN EXCEPCIÓN: cada vez que el cliente responda CUALQUIER dato — así sea corto, un botón, un número, un nombre — vuelve a llamar cotizar_seguro ANTES de escribir tu próximo mensaje, pasando en `campos` TODOS los datos que ya conoces de esta cotización hasta ahora, no solo el nuevo. Si un dato no va dentro de `campos` en esa llamada, no queda guardado, sin importar lo que le hayas dicho al cliente. Nunca redactes tú la siguiente pregunta sin haber llamado la herramienta primero. " +
      "OTRA REGLA SIN EXCEPCIÓN sobre las claves de `campos`: usa EXACTAMENTE el `key` que la herramienta te devolvió en `faltan_datos` para cada dato — cópialo tal cual, nunca lo abrevies ni le cambies el nombre. Si la última respuesta del resultado seguía pidiendo un dato que sientes que ya diste, es casi siempre porque lo mandaste con una clave distinta a la exacta — revisa el `key` de `faltan_datos` y vuelve a intentarlo con esa clave literal, en vez de disculparte con el cliente. " +
      "Si el resultado trae `pregunta_enviada: true`, esa pregunta YA se le envió al cliente (con botones o lista) — no la repitas en tu texto, solo espera la respuesta. Si trae `pregunta_enviada: false`, escríbela tú mismo en texto normal usando `siguiente_pregunta`. " +
      "Cuando confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo."
    );
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const ramo = typeof args.ramo === "string" ? args.ramo : "";
    if (!ramo) return { ok: false, reason: "Falta el ramo." };
    const result = await cotizarSeguroGenerico(
      ctx.db,
      ctx.organizationId,
      { ramo, conversationId: ctx.conversationId, campos: campoStringOnly(args) },
      {
        source: resolveQuoteSource(ctx.channel),
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      }
    );
    return presentNextPending(ctx, result);
  }
};
