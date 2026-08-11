import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowGraph } from "@/lib/automations/node-types";

export interface WebhookTriggerLookup {
  organizationId: string;
  workflowId: string;
  nodeId: string;
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

  if (rows.length > 0) {
    await db.from("workflow_webhook_triggers").insert(rows);
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
