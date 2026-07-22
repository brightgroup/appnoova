import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionDeclaration } from "@google/genai";
import type { NotifyTeamRules } from "@/lib/text-notify-rules";
import type { SchedulingRules, OrgBusinessHours } from "@/lib/scheduling/rules";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { CalendarConnectionRecord } from "@/lib/google-calendar/connections-db";

/**
 * Registro genérico de "tools" para agentes IA (texto y, a futuro, voz).
 * Generaliza el patrón que nació con `notify_team`: cada tool se registra una
 * sola vez (declaration + condición de activación + bloque de prompt + ejecutor)
 * y las superficies de IA (Gemini texto, Gemini Live, ElevenLabs) solo iteran
 * este registro — no hay `if (call.name === "...")` hardcodeado por tool.
 */

/** Config y estado compartido que cualquier tool puede necesitar para decidir si aplica o cómo ejecutarse. */
export interface AgentToolRulesContext {
  notifyRules: NotifyTeamRules;
  schedulingRules: SchedulingRules;
  /** Horario de atención estándar de la organización (una sola vez, compartido por todos los agentes). */
  businessHours: OrgBusinessHours;
  /** Conexión de calendario activa de la organización (si hay), para tools de agendamiento. */
  calendarConnection?: CalendarConnectionRecord | null;
}

/** Contexto de ejecución de una tool (una vez el modelo decide invocarla). */
export interface AgentToolContext extends AgentToolRulesContext {
  db: SupabaseClient;
  organizationId: string;
  conversationId: string | null;
  channel: string;
  agentId?: string | null;
  agentType?: "text" | "voice";
  agentName?: string | null;
  contactLabel?: string | null;
  outboundWhatsAppChannel?: WhatsAppChannelRecord | null;
}

export interface AgentToolResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface AgentToolDefinition {
  name: string;
  declaration: FunctionDeclaration;
  /** ¿Esta tool debe ofrecerse al modelo dado el estado de reglas del agente? */
  isEnabled(ctx: AgentToolRulesContext): boolean;
  /** Instrucciones inyectadas al system prompt cuando la tool está habilitada. */
  buildPromptBlock(ctx: AgentToolRulesContext): string;
  execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult>;
}

export function resolveEnabledTools(
  registry: AgentToolDefinition[],
  ctx: AgentToolRulesContext
): AgentToolDefinition[] {
  return registry.filter(def => def.isEnabled(ctx));
}

export function buildToolsPromptBlock(
  enabled: AgentToolDefinition[],
  ctx: AgentToolRulesContext
): string {
  return enabled
    .map(def => def.buildPromptBlock(ctx))
    .filter(block => block.trim().length > 0)
    .join("\n\n");
}

export function buildFunctionDeclarations(enabled: AgentToolDefinition[]): FunctionDeclaration[] {
  return enabled.map(def => def.declaration);
}

export async function executeAgentTool(
  enabled: AgentToolDefinition[],
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<AgentToolResult> {
  const def = enabled.find(d => d.name === name);
  if (!def) {
    return { ok: false, reason: `Tool desconocida: ${name}` };
  }
  try {
    return await def.execute(args, ctx);
  } catch (err) {
    console.error(`[agent-tools] ${name}:`, err);
    return { ok: false, reason: err instanceof Error ? err.message : "Error ejecutando la tool" };
  }
}
