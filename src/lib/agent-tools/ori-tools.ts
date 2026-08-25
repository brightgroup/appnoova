import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionDeclaration } from "@google/genai";
import { inventoryLookupTool } from "@/lib/agent-tools/inventory-lookup-tool";
import { inventoryMovementsTool } from "@/lib/agent-tools/inventory-movements-tool";

/**
 * Registro de tools SOLO para ORI (copiloto interno) — deliberadamente separado
 * de `ALL_TEXT_AGENT_TOOLS` (src/lib/agent-tools/all-text-tools.ts), que alimenta
 * a los agentes de texto que hablan con clientes externos por WhatsApp/web. Una
 * tool que lee datos internos (como inventario) nunca debe poder llegar a esa
 * superficie por error de un registro compartido — de ahí el registro propio,
 * aunque el shape (declaration/execute) sigue el mismo patrón que
 * `AgentToolDefinition` para que agregar la próxima tool de Ori sea igual de
 * mecánico que agregar una tool de agente de texto.
 */

export interface OriToolContext {
  db: SupabaseClient;
  organizationId: string;
}

export interface OriToolResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface OriToolDefinition {
  name: string;
  declaration: FunctionDeclaration;
  /** Instrucción corta inyectada al system prompt cuando la tool está disponible. */
  promptBlock: string;
  execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult>;
}

/**
 * Instrucción compartida, más estricta que la de cada tool individual —
 * cubre el patrón de alucinación más común: no inventar datos cuando una
 * herramienta está disponible pero el modelo "cree recordar" la respuesta.
 * Aprendido de los ajustes que hubo que hacerle al agente de WhatsApp para
 * catálogos de más de mil productos (ver src/lib/data-tables/catalog-guard.ts):
 * ahí existe una verificación posterior que corrige la respuesta contra la
 * base real; acá no hay ese resguardo — la precisión depende de que el
 * modelo SIEMPRE llame a la herramienta y relate sus datos tal cual.
 */
export const ORI_GROUNDING_PROMPT =
  "Reglas para inventario: NUNCA respondas preguntas de existencias, stock mínimo o movimientos usando lo que recuerdes de un mensaje anterior — vuelve a llamar a la herramienta correspondiente en cada pregunta nueva, aunque parezca repetida, porque el inventario puede haber cambiado. Si una herramienta no encuentra el producto o no tiene datos, dilo tal cual — nunca completes con un valor supuesto o aproximado.";

export async function executeOriTool(
  tools: OriToolDefinition[],
  name: string,
  args: Record<string, unknown>,
  ctx: OriToolContext
): Promise<OriToolResult> {
  const def = tools.find(t => t.name === name);
  if (!def) return { ok: false, reason: `Tool desconocida: ${name}` };
  try {
    return await def.execute(args, ctx);
  } catch (err) {
    console.error(`[ori-tools] ${name}:`, err);
    return { ok: false, reason: err instanceof Error ? err.message : "Error ejecutando la tool" };
  }
}

/** Registro de todas las tools de Ori — agregar una nueva es sumarla acá. */
export const ORI_TOOLS: OriToolDefinition[] = [inventoryLookupTool, inventoryMovementsTool];
