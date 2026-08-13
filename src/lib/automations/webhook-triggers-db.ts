import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowGraph } from "@/lib/automations/node-types";

export interface WebhookTriggerLookup {
  organizationId: string;
  workflowId: string;
  nodeId: string;
}

/** El nombre de un webhook entrante ya lo usa otro workflow — `token` es llave primaria en `workflow_webhook_triggers`. */
export class DuplicateWebhookTokenError extends Error {
  constructor(public readonly token: string) {
    super(`El nombre de webhook "${token}" ya está en uso en otro workflow.`);
    this.name = "DuplicateWebhookTokenError";
  }
}

/**
 * Reescribe el índice `workflow_webhook_triggers` de un workflow a partir de
 * su grafo ya guardado — se llama después de cada `updateWorkflowGraph`. La
 * fuente de verdad del token sigue siendo `node.data.webhookToken` dentro del
 * grafo; esta tabla solo existe para resolver el callback público por token
 * sin escanear todos los workflows de la organización.
 */
export async function syncWebhookTriggers(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string,
  graph: WorkflowGraph
): Promise<void> {
  await db.from("workflow_webhook_triggers").delete().eq("workflow_id", workflowId);

  const rows = graph.nodes
    .filter((n) => n.type === "trigger.webhook" && typeof n.data.webhookToken === "string" && n.data.webhookToken)
    .map((n) => ({
      token: n.data.webhookToken as string,
      organization_id: organizationId,
      workflow_id: workflowId,
      node_id: n.id
    }));

  if (rows.length === 0) return;

  const { error } = await db.from("workflow_webhook_triggers").insert(rows);
  if (error) {
    if (error.code === "23505") {
      const duplicate = rows.find((r) => error.message.includes(r.token)) ?? rows[0];
      throw new DuplicateWebhookTokenError(duplicate.token);
    }
    throw new Error(error.message);
  }
}

export async function getWebhookTriggerByToken(
  db: SupabaseClient,
  token: string
): Promise<WebhookTriggerLookup | null> {
  const { data } = await db
    .from("workflow_webhook_triggers")
    .select("organization_id, workflow_id, node_id")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  return {
    organizationId: data.organization_id as string,
    workflowId: data.workflow_id as string,
    nodeId: data.node_id as string
  };
}
