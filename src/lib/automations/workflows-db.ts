import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_GRAPH, ensureWebhookTokens, normalizeWorkflowGraph, type WorkflowGraph } from "@/lib/automations/node-types";
import { syncWebhookTriggers } from "@/lib/automations/webhook-triggers-db";

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "paused";
  graph: WorkflowGraph;
  updatedAt: string;
  createdAt: string;
}

interface WorkflowRow {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  graph: unknown;
  updated_at: string;
  created_at: string;
}

function toRecord(row: WorkflowRow): WorkflowRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status as WorkflowRecord["status"],
    graph: normalizeWorkflowGraph(row.graph),
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

export async function listWorkflowsForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<WorkflowRecord[]> {
  const { data } = await db
    .from("workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return ((data as WorkflowRow[] | null) ?? []).map(toRecord);
}

export async function getWorkflowById(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string
): Promise<WorkflowRecord | null> {
  const { data } = await db
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data ? toRecord(data as WorkflowRow) : null;
}

/** Todos los workflows activos de la org — usado por el motor de emisión de eventos. */
export async function listActiveWorkflowsForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<WorkflowRecord[]> {
  const { data } = await db
    .from("workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return ((data as WorkflowRow[] | null) ?? []).map(toRecord);
}

export async function createWorkflow(
  db: SupabaseClient,
  organizationId: string,
  createdByUserId: string,
  name: string
): Promise<WorkflowRecord> {
  const { data, error } = await db
    .from("workflows")
    .insert({
      organization_id: organizationId,
      name,
      status: "active",
      graph: EMPTY_GRAPH,
      created_by_user_id: createdByUserId
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Error creando el workflow");
  }

  return toRecord(data as WorkflowRow);
}

export async function updateWorkflowGraph(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string,
  graph: WorkflowGraph
): Promise<WorkflowRecord | null> {
  const graphWithTokens = ensureWebhookTokens(graph);

  const { data } = await db
    .from("workflows")
    .update({ graph: graphWithTokens, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (!data) return null;
  await syncWebhookTriggers(db, organizationId, workflowId, graphWithTokens);
  return toRecord(data as WorkflowRow);
}

export async function setWorkflowStatus(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string,
  status: "active" | "paused"
): Promise<WorkflowRecord | null> {
  const { data } = await db
    .from("workflows")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  return data ? toRecord(data as WorkflowRow) : null;
}

export async function renameWorkflow(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string,
  name: string
): Promise<WorkflowRecord | null> {
  const { data } = await db
    .from("workflows")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  return data ? toRecord(data as WorkflowRow) : null;
}

export async function deleteWorkflow(
  db: SupabaseClient,
  organizationId: string,
  workflowId: string
): Promise<boolean> {
  const { error } = await db
    .from("workflows")
    .delete()
    .eq("id", workflowId)
    .eq("organization_id", organizationId);

  return !error;
}
