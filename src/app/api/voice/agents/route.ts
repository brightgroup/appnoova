import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getTemplateDefaults } from "@/lib/voice-agent-templates";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

/** GET ?template_id= — devuelve agente del usuario o defaults de plantilla */
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const templateId = req.nextUrl.searchParams.get("template_id");
  if (!templateId) {
    return NextResponse.json({ error: "template_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("voice_agents")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({
        agent: null,
        defaults: getTemplateDefaults(templateId),
        saved: false,
        dbReady: false
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    return NextResponse.json({
      agent: normalizeVoiceAgentForm({ ...data, template_id: data.template_id }),
      saved: true,
      dbReady: true
    });
  }

  return NextResponse.json({
    agent: null,
    defaults: getTemplateDefaults(templateId),
    saved: false,
    dbReady: true
  });
}

/** POST — crea o actualiza agente del usuario (no modifica plantillas globales) */
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const templateId = body.template_id as string;
  if (!templateId) {
    return NextResponse.json({ error: "template_id requerido" }, { status: 400 });
  }

  const defaults = getTemplateDefaults(templateId);
  const row = {
    user_id: userId,
    template_id: templateId,
    name: body.name ?? defaults.name,
    prompt: body.prompt ?? defaults.prompt,
    voice_name: body.voice_name ?? defaults.voice_name,
    model: body.model ?? defaults.model,
    voice_speed: body.voice_speed ?? defaults.voice_speed,
    temperature: body.temperature ?? defaults.temperature,
    volume: body.volume ?? defaults.volume,
    llm_model: body.llm_model ?? defaults.llm_model,
    color: body.color ?? defaults.color,
    updated_at: new Date().toISOString()
  };

  const db = adminClient();
  const { data, error } = await db
    .from("voice_agents")
    .upsert(row, { onConflict: "user_id,template_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    agent: normalizeVoiceAgentForm({ ...data, template_id: data.template_id }),
    saved: true
  });
}
