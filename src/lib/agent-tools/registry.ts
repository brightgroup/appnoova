import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionDeclaration } from "@google/genai";
import type { NotifyTeamRules } from "@/lib/text-notify-rules";
import type { SchedulingRules, OrgBusinessHours } from "@/lib/scheduling/rules";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { CalendarConnectionRecord } from "@/lib/google-calendar/connections-db";
import type { QuotingRules } from "@/lib/insurers/quoting-rules";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

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
  /** Interruptor propio del agente para el cotizador de seguros — ver src/lib/insurers/quoting-rules.ts. */
  quotingRules: QuotingRules;
  /**
   * Campos de cotización configurados por la organización, por ramo (clave =
   * "autos", "motos", etc. — ver ramos-cotizables.ts) — precargados una sola
   * vez por turno (igual que calendarConnection) porque buildPromptBlock es
   * síncrono y no tiene `db`. Vacío `{}` cuando quotingRules.enabled es false
   * o no se precargó (ej. canal sin seguros).
   */
  ramoCampos: Record<string, RamoCampoDef[]>;
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
  /** Teléfono E.164 del cliente en la conversación — solo presente en canal WhatsApp. */
  contactE164?: string | null;
  /**
   * Field keys de preguntas guiadas (botones/lista) ya enviadas por WhatsApp
   * en ESTE turno de `generateTextAgentReply` — mismo Set compartido por
   * referencia entre las hasta 3 rondas de function-calling de un turno (ver
   * *-generate.ts/-openai.ts/-claude.ts). Evita mandar el mismo botón dos
   * veces cuando el modelo llama la tool de cotización más de una vez en el
   * mismo turno (causa raíz confirmada de los botones duplicados vistos en
   * pruebas en vivo) — ver `presentGuidedQuestion` en guided-questions.ts.
   */
  sentGuidedQuestions?: Set<string>;
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

/**
 * Red de seguridad final: si la ÚLTIMA tool de cotización llamada en el turno
 * dejó una pregunta pendiente por escribir en texto (`pregunta_enviada:
 * false` + `siguiente_pregunta`, ver guided-questions.ts), pero el texto
 * final del modelo no la incluye, se la agrega igual — en vez de confiar en
 * que el modelo la haya redactado (o no haya declarado, por su cuenta, que
 * la cotización ya está completa cuando en realidad `faltan_datos` seguía
 * teniendo algo).
 *
 * CONFIRMADO EN PRUEBAS EN VIVO 2026-09-15: el modelo puede llamar la tool,
 * recibir `completo: false` + una pregunta pendiente, y aun así redactar un
 * texto final tipo "¡Ya tengo todos tus datos!" — ignorando el resultado real
 * de su propia tool. Mismo patrón que los otros dos bugs de esta sesión
 * (botones que no salían, claves de campo inventadas): el prompt por sí solo
 * no lo evita de forma confiable, hace falta esta verificación en código.
 */
export function enforcePendingQuestion(text: string, toolResults: { name: string; result: AgentToolResult }[]): string {
  const last = toolResults[toolResults.length - 1]?.result as
    | { pregunta_enviada?: boolean; siguiente_pregunta?: string }
    | undefined;
  if (!last || last.pregunta_enviada !== false) return text;

  const pregunta = typeof last.siguiente_pregunta === "string" ? last.siguiente_pregunta.trim() : "";
  if (!pregunta) return text;

  const yaLaHizo = text.toLowerCase().includes(pregunta.toLowerCase().slice(0, 24));
  return yaLaHizo ? text : `${text}\n\n${pregunta}`;
}
