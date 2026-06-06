import { NextRequest, NextResponse } from "next/server";
import { getTemplateDefaults, resolveBaseTemplateId } from "@/lib/voice-agent-templates";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import { toVoiceAgentListItem, toVoiceAgentRecord } from "@/lib/voice-agent-record";
import { insertVoiceAgentRow, updateVoiceAgentRow } from "@/lib/voice-agents-db";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

function dbNotReady() {
  return NextResponse.json({ agents: [], dbReady: false });
}

/**
 * GET /api/voice/agents
 *   → lista de agentes del usuario autenticado (multitenant)
 * GET /api/voice/agents?id=
 *   → un agente del usuario
 * GET /api/voice/agents?source_template=lead-qualification
 *   → solo defaults de plantilla en código (sin leer BD)
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const agentId = req.nextUrl.searchParams.get("id");
  const sourceTemplateParam =
    req.nextUrl.searchParams.get("source_template") ||
    req.nextUrl.searchParams.get("template_id");
  const db = adminClient();

  if (agentId) {
    const { data, error } = await db
      .from("voice_agents")
      .select("*")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ agent: null, defaults: null, saved: false, dbReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      agent: toVoiceAgentRecord(data),
      saved: true,
      dbReady: true
    });
  }

  if (sourceTemplateParam) {
    const base = resolveBaseTemplateId(sourceTemplateParam);
    return NextResponse.json({
      agent: null,
      defaults: getTemplateDefaults(base),
      saved: false,
      dbReady: true
    });
  }

  const { data, error } = await db
    .from("voice_agents")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return dbNotReady();
    const msg = error.message ?? "";
    const needsMigration =
      msg.includes("contacts_count") ||
      msg.includes("quality_label") ||
      msg.includes("source_template");
    return NextResponse.json(
      {
        error: needsMigration
          ? "Ejecuta las migraciones en supabase/APPLY_IN_SUPABASE.sql y 003_voice_agents_source_template.sql"
          : msg
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    agents: (data ?? []).map((row) => toVoiceAgentListItem(row)),
    dbReady: true
  });
}

/** POST — crea instancia del usuario (precargada desde plantilla en código) o actualiza por id */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const sourceTemplate = resolveBaseTemplateId(
    (body.source_template || body.template_id) as string
  );

  if (!sourceTemplate) {
    return NextResponse.json({ error: "source_template requerido" }, { status: 400 });
  }

  const defaults = getTemplateDefaults(sourceTemplate);
  const form = normalizeVoiceAgentForm({
    ...defaults,
    ...body,
    source_template: sourceTemplate
  });

  let agentName = form.name;
  const db = adminClient();

  if (!body.id) {
    const { count } = await db
      .from("voice_agents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const n = (count ?? 0) + 1;
    if (n > 1 && agentName === defaults.name) {
      agentName = `${defaults.name} (${n})`;
    }
  }

  const row = {
    user_id: userId,
    source_template: sourceTemplate,
    template_id: sourceTemplate,
    name: agentName,
    prompt: form.prompt,
    voice_name: form.voice_name,
    model: form.model,
    voice_speed: form.voice_speed,
    temperature: form.temperature,
    volume: form.volume,
    llm_model: form.llm_model,
    color: form.color ?? defaults.color,
    company_context_id: form.company_context_id || null,
    updated_at: new Date().toISOString()
  };

  if (body.id) {
    let { data, error } = await updateVoiceAgentRow(db, row, body.id, userId);

    if (error?.message?.includes("company_context_id")) {
      const { company_context_id: _c, ...rest } = row;
      ({ data, error } = await updateVoiceAgentRow(db, rest, body.id, userId));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      agent: toVoiceAgentRecord(data),
      saved: true
    });
  }

  let { data, error } = await insertVoiceAgentRow(db, row);

  if (error?.message?.includes("company_context_id")) {
    const { company_context_id: _c, ...rest } = row;
    ({ data, error } = await insertVoiceAgentRow(db, rest));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    agent: toVoiceAgentRecord(data),
    saved: true,
    created: true
  });
}
