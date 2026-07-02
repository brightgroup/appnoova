import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBaseTemplateId } from "@/lib/voice-agent-templates";

let hasSourceTemplateColumn: boolean | null = null;

export async function detectVoiceAgentsSchema(db: SupabaseClient) {
  if (hasSourceTemplateColumn !== null) return;
  const { error } = await db.from("voice_agents").select("source_template").limit(0);
  hasSourceTemplateColumn = !error?.message?.includes("source_template");
}

type AgentRow = Record<string, unknown>;

function stripSourceTemplate(row: AgentRow): AgentRow {
  const { source_template: _st, ...rest } = row;
  return rest;
}

function withInstanceTemplateId(row: AgentRow): AgentRow {
  const base = resolveBaseTemplateId(String(row.template_id ?? row.source_template ?? "lead-qualification"));
  return { ...row, template_id: `${base}::${randomUUID().replace(/-/g, "").slice(0, 8)}` };
}

export async function insertVoiceAgentRow(db: SupabaseClient, row: AgentRow) {
  await detectVoiceAgentsSchema(db);

  let payload: AgentRow = { ...row };
  if (!hasSourceTemplateColumn) {
    payload = stripSourceTemplate(payload);
    if (!String(payload.template_id).includes("::")) {
      payload = withInstanceTemplateId(payload);
    }
  }

  let result = await db.from("voice_agents").insert(payload).select().single();
  if (result.error?.code === "23505") {
    result = await db
      .from("voice_agents")
      .insert(withInstanceTemplateId(stripSourceTemplate(row)))
      .select()
      .single();
  }
  if (result.error?.message?.includes("source_template")) {
    result = await db
      .from("voice_agents")
      .insert(withInstanceTemplateId(stripSourceTemplate(row)))
      .select()
      .single();
  }

  return result;
}

export async function updateVoiceAgentRow(
  db: SupabaseClient,
  row: AgentRow,
  id: string,
  organizationId: string
) {
  await detectVoiceAgentsSchema(db);

  let payload: AgentRow = { ...row };
  if (!hasSourceTemplateColumn) {
    payload = stripSourceTemplate(payload);
    delete payload.template_id;
  }

  let result = await db
    .from("voice_agents")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (result.error?.message?.includes("source_template")) {
    result = await db
      .from("voice_agents")
      .update(stripSourceTemplate(row))
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
  }

  return result;
}
