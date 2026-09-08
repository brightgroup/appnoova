import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { sendWhatsAppInteractiveMessage } from "@/lib/whatsapp/send-transport";

/**
 * Botones/lista de WhatsApp (Fase 2.5 del plan de Noova Seguros) — para que la
 * IA presente decisiones cortas (confirmar datos, elegir un plan) como algo
 * que el cliente toca en vez de escribe. Gateada por el mismo interruptor que
 * el cotizador (quoting_rules): es parte del flujo de seguros, no una tool
 * genérica para cualquier agente todavía.
 *
 * Límite real de la API de WhatsApp: solo sirve para elegir entre opciones
 * cortas (máx. 3 botones o una lista de hasta 10) — nunca para pedir texto
 * libre (nombre, fecha de nacimiento siguen siendo mensajes normales).
 */
export const presentarOpcionesWhatsAppTool: AgentToolDefinition = {
  name: "presentar_opciones_whatsapp",
  declaration: {
    name: "presentar_opciones_whatsapp",
    description:
      "Envía hasta 3 opciones como botones (o hasta 10 como lista) para que el cliente elija con un toque en vez de escribir. Úsala SOLO para decisiones cortas y discretas — ej. confirmar un dato, elegir un plan de cobertura. NUNCA la uses para pedir datos abiertos como nombre, documento o fecha de nacimiento — eso sigue siendo una pregunta de texto normal.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pregunta: { type: Type.STRING, description: "Texto corto de la pregunta o contexto antes de las opciones." },
        opciones: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Entre 2 y 10 opciones cortas (máx. ~20 caracteres cada una si son botones)."
        }
      },
      required: ["pregunta", "opciones"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return "Tienes una herramienta (presentar_opciones_whatsapp) para mostrar hasta 3 opciones como botones táctiles cuando el cliente deba elegir algo corto y concreto (confirmar un dato, elegir un plan). No la uses para pedir información abierta.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const pregunta = typeof args.pregunta === "string" ? args.pregunta.trim() : "";
    const opciones = Array.isArray(args.opciones)
      ? args.opciones.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : [];

    if (!pregunta || opciones.length < 2) {
      return { ok: false, reason: "Falta la pregunta o hay menos de 2 opciones." };
    }
    if (!ctx.outboundWhatsAppChannel || !ctx.contactE164) {
      return { ok: false, reason: "Esta herramienta solo funciona en conversaciones de WhatsApp." };
    }

    try {
      if (opciones.length <= 3) {
        await sendWhatsAppInteractiveMessage({
          channel: ctx.outboundWhatsAppChannel,
          toE164: ctx.contactE164,
          body: pregunta,
          buttons: opciones.map((title, i) => ({ id: `opt_${i}`, title: title.slice(0, 20) })),
          db: ctx.db
        });
      } else {
        await sendWhatsAppInteractiveMessage({
          channel: ctx.outboundWhatsAppChannel,
          toE164: ctx.contactE164,
          body: pregunta,
          listSections: [{ rows: opciones.slice(0, 10).map((title, i) => ({ id: `opt_${i}`, title: title.slice(0, 24) })) }],
          db: ctx.db
        });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "No se pudo enviar las opciones." };
    }
  }
};
