import { NextRequest, NextResponse } from "next/server";
import { getTextTemplateDefaults, resolveBaseTextTemplateId } from "@/lib/text-agent-templates";
import { normalizeTextAgentForm } from "@/lib/text-agent-form";
import { toTextAgentListItem, toTextAgentRecord } from "@/lib/text-agent-record";
import { insertTextAgentRow, updateTextAgentRow } from "@/lib/text-agents-db";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { requireOrgModule } from "@/lib/module-auth";

function dbNotReady() {
  return NextResponse.json({ agents: [], dbReady: false });
}

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "text_agents", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const agentId = req.nextUrl.searchParams.get("id");
  const sourceTemplateParam =
    req.nextUrl.searchParams.get("source_template") ||
    req.nextUrl.searchParams.get("template_id");
  const db = textAgentsAdminClient();

  if (agentId) {
    const { data, error } = await db
      .from("text_agents")
      .select("*")
      .eq("id", agentId)
      .eq("organization_id", orgCtx.organizationId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ agent: null, saved: false, dbReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      agent: toTextAgentRecord(data),
      saved: true,
      dbReady: true
    });
  }

  if (sourceTemplateParam) {
    const base = resolveBaseTextTemplateId(sourceTemplateParam);
    return NextResponse.json({
      agent: null,
      defaults: getTextTemplateDefaults(base),
      saved: false,
      dbReady: true
    });
  }

  const { data, error } = await db
    .from("text_agents")
    .select("*")
    .eq("organization_id", orgCtx.organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return dbNotReady();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    agents: (data ?? []).map(row => toTextAgentListItem(row)),
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "text_agents", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json();
  const sourceTemplate = resolveBaseTextTemplateId(
    (body.source_template || body.template_id) as string
  );

  if (!sourceTemplate) {
    return NextResponse.json({ error: "source_template requerido" }, { status: 400 });
  }

  const defaults = getTextTemplateDefaults(sourceTemplate);
  const form = normalizeTextAgentForm({
    ...defaults,
    ...body,
    source_template: sourceTemplate
  });

  let agentName = form.name;
  const db = textAgentsAdminClient();

  if (!body.id) {
    const { count } = await db
      .from("text_agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgCtx.organizationId);
    const n = (count ?? 0) + 1;
    if (n > 1 && agentName === defaults.name) {
      agentName = `${defaults.name} (${n})`;
    }
  }

  const row = {
    user_id: orgCtx.userId,
    organization_id: orgCtx.organizationId,
    source_template: sourceTemplate,
    template_id: sourceTemplate,
    name: agentName,
    prompt: form.prompt,
    temperature: form.temperature,
    llm_model: form.llm_model,
    max_output_tokens: form.max_output_tokens,
    color: form.color ?? defaults.color,
    company_context_id: form.company_context_id || null,
    data_table_id: form.data_table_id || null,
    notify_rules: form.notify_rules ?? {},
    updated_at: new Date().toISOString()
  };

  if (body.id) {
    let { data, error } = await updateTextAgentRow(db, row, body.id, orgCtx.organizationId);

    if (
      error?.message?.includes("company_context_id")
      || error?.message?.includes("data_table_id")
      || error?.message?.includes("notify_rules")
    ) {
      const { company_context_id: _c, data_table_id: _d, notify_rules: _n, ...rest } = row;
      ({ data, error } = await updateTextAgentRow(db, rest, body.id, orgCtx.organizationId));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      agent: toTextAgentRecord(data),
      saved: true
    });
  }

  let { data, error } = await insertTextAgentRow(db, row);

  if (
    error?.message?.includes("company_context_id")
    || error?.message?.includes("data_table_id")
    || error?.message?.includes("notify_rules")
  ) {
    const { company_context_id: _c, data_table_id: _d, notify_rules: _n, ...rest } = row;
    ({ data, error } = await insertTextAgentRow(db, rest));
  }

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Falta la tabla text_agents en Supabase. Ejecuta la sección «Agentes de texto» en supabase/APPLY_IN_SUPABASE.sql (o supabase/migrations/012_text_agents.sql)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    agent: toTextAgentRecord(data),
    saved: true,
    created: true
  });
}

export async function DELETE(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "text_agents", "manage");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const agentId = req.nextUrl.searchParams.get("id");
  if (!agentId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();

  const { data: existing, error: fetchErr } = await db
    .from("text_agents")
    .select("id")
    .eq("id", agentId)
    .eq("organization_id", orgCtx.organizationId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const { error: deleteErr } = await db
    .from("text_agents")
    .delete()
    .eq("id", agentId)
    .eq("organization_id", orgCtx.organizationId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
