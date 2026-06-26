import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBaseTextTemplateId } from "@/lib/text-agent-templates";

type AgentRow = Record<string, unknown>;

function withInstanceTemplateId(row: AgentRow): AgentRow {
  const base = resolveBaseTextTemplateId(String(row.template_id ?? row.source_template ?? "customer-assistant"));
  return { ...row, template_id: `${base}::${randomUUID().replace(/-/g, "").slice(0, 8)}` };
}

export async function insertTextAgentRow(db: SupabaseClient, row: AgentRow) {
  let payload: AgentRow = { ...row };
  if (!String(payload.template_id).includes("::")) {
    payload = withInstanceTemplateId(payload);
  }

  let result = await db.from("text_agents").insert(payload).select().single();
  if (result.error?.code === "23505") {
    result = await db.from("text_agents").insert(withInstanceTemplateId(row)).select().single();
  }
  return result;
}

export async function updateTextAgentRow(
  db: SupabaseClient,
  row: AgentRow,
  id: string,
  organizationId: string
) {
  const payload: AgentRow = { ...row };
  delete payload.template_id;

  return db
    .from("text_agents")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();
}
