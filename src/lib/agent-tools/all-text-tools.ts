import type { AgentToolDefinition } from "@/lib/agent-tools/registry";
import { notifyTeamTool } from "@/lib/agent-tools/notify-team-tool";
import { SCHEDULING_TOOLS } from "@/lib/scheduling/tools";
import { cotizarSeguroAutoAgentTool } from "@/lib/agent-tools/auto-quote-agent-tool";
import { calificarSeguroVidaAgentTool } from "@/lib/agent-tools/life-quote-agent-tool";
import { calificarSeguroHogarAgentTool } from "@/lib/agent-tools/home-quote-agent-tool";
import { presentarOpcionesWhatsAppTool } from "@/lib/agent-tools/whatsapp-options-tool";
import { radicarSiniestroAgentTool } from "@/lib/agent-tools/siniestro-agent-tool";

/** Todas las tools disponibles para agentes de texto (Gemini `generateContent`). */
export const ALL_TEXT_AGENT_TOOLS: AgentToolDefinition[] = [
  notifyTeamTool,
  ...SCHEDULING_TOOLS,
  cotizarSeguroAutoAgentTool,
  calificarSeguroVidaAgentTool,
  calificarSeguroHogarAgentTool,
  presentarOpcionesWhatsAppTool,
  radicarSiniestroAgentTool
];
