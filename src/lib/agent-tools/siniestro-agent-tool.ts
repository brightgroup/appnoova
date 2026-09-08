import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { radicarSiniestro } from "@/lib/insurers/siniestro-tool";

/** Tool para el agente que habla con el cliente final: registra el siniestro y trae el checklist real — mismo gating que el cotizador (quoting_rules.enabled). */
export const radicarSiniestroAgentTool: AgentToolDefinition = {
  name: "radicar_siniestro",
  declaration: {
    name: "radicar_siniestro",
    description:
      "Registra un siniestro y trae el checklist de documentos + a dónde reportar, según el playbook cargado para esa aseguradora y ramo. Úsala cuando el cliente reporte un siniestro o pregunte cómo proceder. Si no hay playbook cargado, dilo tal cual — no inventes el checklist ni el proceso.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        aseguradora: { type: Type.STRING, description: "Nombre de la aseguradora del cliente." },
        ramo: { type: Type.STRING, description: "Ramo del siniestro (ej. autos, hogar, vida)." },
        descripcion: { type: Type.STRING, description: "Descripción breve de lo ocurrido, si la dio el cliente." },
        fecha_ocurrencia: { type: Type.STRING, description: "Fecha del siniestro en formato YYYY-MM-DD, si la dio." }
      },
      required: ["aseguradora", "ramo"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return "Tienes una herramienta (radicar_siniestro) para registrar un siniestro real. Recuerda al cliente el plazo legal: tiene 3 días hábiles para avisar, y el mes que tiene la aseguradora para pagar arranca solo cuando la reclamación está \"en forma\" (todos los documentos completos) — por eso pide el checklist completo que te devuelva la herramienta desde el primer mensaje, no vayas pidiendo papel por papel en el camino. Si la herramienta dice que no hay playbook cargado para esa aseguradora, comunícalo con honestidad y ofrece escalar a un asesor humano.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const result = await radicarSiniestro(
      {
        aseguradora: typeof args.aseguradora === "string" ? args.aseguradora : "",
        ramo: typeof args.ramo === "string" ? args.ramo : "",
        descripcion: typeof args.descripcion === "string" ? args.descripcion : undefined,
        fecha_ocurrencia: typeof args.fecha_ocurrencia === "string" ? args.fecha_ocurrencia : undefined
      },
      ctx,
      { source: "whatsapp", conversationId: ctx.conversationId }
    );
    return { ...result };
  }
};
