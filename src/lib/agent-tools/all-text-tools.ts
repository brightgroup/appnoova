import type { AgentToolDefinition } from "@/lib/agent-tools/registry";
import { notifyTeamTool } from "@/lib/agent-tools/notify-team-tool";
import { SCHEDULING_TOOLS } from "@/lib/scheduling/tools";
import { cotizarSeguroAutoAgentTool } from "@/lib/agent-tools/auto-quote-agent-tool";
import { calificarSeguroVidaAgentTool } from "@/lib/agent-tools/life-quote-agent-tool";
import { calificarSeguroHogarAgentTool } from "@/lib/agent-tools/home-quote-agent-tool";
import { calificarSeguroMotoAgentTool } from "@/lib/agent-tools/moto-quote-agent-tool";
import { calificarSoatAgentTool } from "@/lib/agent-tools/soat-quote-agent-tool";
import { calificarAccidentesAgentTool } from "@/lib/agent-tools/accident-quote-agent-tool";
import { presentarOpcionesWhatsAppTool } from "@/lib/agent-tools/whatsapp-options-tool";
import { radicarSiniestroAgentTool } from "@/lib/agent-tools/siniestro-agent-tool";
import { cotizarSeguroAgentTool } from "@/lib/agent-tools/generic-quote-agent-tools";
import { WOOCOMMERCE_TOOLS } from "@/lib/woocommerce/agent-tools";

/** Todas las tools disponibles para agentes de texto (Gemini `generateContent`). */
export const ALL_TEXT_AGENT_TOOLS: AgentToolDefinition[] = [
  notifyTeamTool,
  ...SCHEDULING_TOOLS,
  ...WOOCOMMERCE_TOOLS,
  cotizarSeguroAutoAgentTool,
  calificarSeguroVidaAgentTool,
  calificarSeguroHogarAgentTool,
  calificarSeguroMotoAgentTool,
  calificarSoatAgentTool,
  calificarAccidentesAgentTool,
  // Motor genérico (ver RAMOS_MOTOR_GENERICO en ramos-cotizables.ts) — todos
  // los ramos sin lookup propio ni tool dedicada (mascotas, viaje, salud,
  // ARL, pyme, etc.), extraídos de Figuro.
  cotizarSeguroAgentTool,
  presentarOpcionesWhatsAppTool,
  radicarSiniestroAgentTool
];
