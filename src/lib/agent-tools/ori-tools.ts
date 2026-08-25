import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionDeclaration } from "@google/genai";

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
