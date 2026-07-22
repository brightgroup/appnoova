import type { AgentToolDefinition } from "@/lib/agent-tools/registry";
import { notifyTeamTool } from "@/lib/agent-tools/notify-team-tool";
import { SCHEDULING_TOOLS } from "@/lib/scheduling/tools";

/** Todas las tools disponibles para agentes de texto (Gemini `generateContent`). */
export const ALL_TEXT_AGENT_TOOLS: AgentToolDefinition[] = [notifyTeamTool, ...SCHEDULING_TOOLS];
