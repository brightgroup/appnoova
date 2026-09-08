import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { radicarSiniestro } from "@/lib/insurers/siniestro-tool";

/** Tool de ORI: registra un siniestro y trae el checklist real de documentos de la aseguradora (playbook en /dashboard/tablas) — nunca inventa el checklist si no hay playbook cargado. */
export const radicarSiniestroOriTool: OriToolDefinition = {
  name: "radicar_siniestro",
  declaration: {
    name: "radicar_siniestro",
    description:
      "Registra un siniestro y trae el checklist de documentos + a dónde reportar, según el playbook cargado para esa aseguradora y ramo. Úsala cuando te pidan orientación o registrar un siniestro. Si no hay playbook cargado para esa aseguradora, dilo tal cual — no inventes el checklist.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        aseguradora: { type: Type.STRING, description: "Nombre de la aseguradora." },
        ramo: { type: Type.STRING, description: "Ramo del siniestro (ej. autos, hogar, vida)." },
        descripcion: { type: Type.STRING, description: "Descripción breve de lo ocurrido, si la dieron." },
        fecha_ocurrencia: { type: Type.STRING, description: "Fecha del siniestro en formato YYYY-MM-DD, si la dieron." }
      },
      required: ["aseguradora", "ramo"]
    }
  },
  promptBlock:
    "Tienes una herramienta (radicar_siniestro) para registrar un siniestro y traer el checklist real de documentos de esa aseguradora. Recuerda siempre el ángulo legal: 3 días hábiles para avisar, y el mes de la aseguradora para pagar arranca solo cuando la reclamación está \"en forma\" (todos los documentos completos) — por eso conviene pedir el checklist completo desde ya. Si la herramienta dice que no hay playbook cargado, dile al usuario que hay que cargarlo en Tablas de datos, no inventes el checklist.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const result = await radicarSiniestro(
      {
        aseguradora: typeof args.aseguradora === "string" ? args.aseguradora : "",
        ramo: typeof args.ramo === "string" ? args.ramo : "",
        descripcion: typeof args.descripcion === "string" ? args.descripcion : undefined,
        fecha_ocurrencia: typeof args.fecha_ocurrencia === "string" ? args.fecha_ocurrencia : undefined
      },
      ctx,
      { source: "ori" }
    );
    return { ...result };
  }
};
