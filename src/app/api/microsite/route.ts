import { NextRequest, NextResponse } from "next/server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { normalizeMicrositeForm, toMicrositeRecord } from "@/lib/microsite-record";
import { buildMicrositePublicUrl, isValidMicrositeSlug, slugifyBrandName } from "@/lib/microsite-slug";
import { getMicrositeByUserId } from "@/lib/microsite-server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

async function validateRelations(
  db: ReturnType<typeof textAgentsAdminClient>,
  userId: string,
  companyContextId: string | null,
  textAgentId: string | null
): Promise<string | null> {
  if (companyContextId) {
    const { data } = await db
      .from("company_contexts")
      .select("id")
      .eq("id", companyContextId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return "Contexto de marca no encontrado";
  }

  if (textAgentId) {
    const { data } = await db
      .from("text_agents")
      .select("id")
      .eq("id", textAgentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return "Agente de texto no encontrado";
  }

  return null;
}

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const microsite = await getMicrositeByUserId(db, userId);

  if (!microsite) {
    return NextResponse.json({ microsite: null, dbReady: true });
  }

  return NextResponse.json({
    microsite,
    public_url: buildMicrositePublicUrl(microsite.slug),
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const form = normalizeMicrositeForm(body);

  if (!isValidMicrositeSlug(form.slug)) {
    return NextResponse.json(
      { error: "Slug inválido. Usa letras minúsculas, números y guiones (3–50 caracteres)." },
      { status: 400 }
    );
  }

  if (!form.text_agent_id && form.is_published) {
    return NextResponse.json({ error: "Selecciona un agente de texto antes de publicar" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const relationErr = await validateRelations(db, userId, form.company_context_id, form.text_agent_id);
  if (relationErr) {
    return NextResponse.json({ error: relationErr }, { status: 400 });
  }

  const existing = await getMicrositeByUserId(db, userId);

  if (existing && form.slug !== existing.slug) {
    return NextResponse.json(
      { error: "La URL del micrositio no se puede cambiar después de crearla." },
      { status: 400 }
    );
  }

  let companyContextId: string | null = null;
  if (form.text_agent_id) {
    const { data: agent } = await db
      .from("text_agents")
      .select("company_context_id")
      .eq("id", form.text_agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    companyContextId = agent?.company_context_id ? String(agent.company_context_id) : null;
  }

  const row = {
    user_id: userId,
    slug: existing ? existing.slug : form.slug,
    company_context_id: companyContextId,
    text_agent_id: form.text_agent_id,
    accent_color: form.accent_color,
    button_color: form.button_color,
    logo_url: form.logo_url,
    favicon_url: form.favicon_url,
    agent_display_name: form.agent_display_name,
    quick_actions: form.quick_actions,
    is_published: form.is_published,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { data, error } = await db
      .from("broker_microsites")
      .update(row)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: "Ejecuta la migración 014_broker_microsites.sql" }, { status: 503 });
      }
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ese nombre de link ya está en uso" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const microsite = toMicrositeRecord(data);
    return NextResponse.json({
      microsite,
      public_url: buildMicrositePublicUrl(microsite.slug)
    });
  }

  const { data: slugTaken } = await db
    .from("broker_microsites")
    .select("id")
    .eq("slug", form.slug)
    .maybeSingle();
  if (slugTaken) {
    return NextResponse.json({ error: "Ese nombre de link ya está en uso" }, { status: 409 });
  }

  const { data, error } = await db
    .from("broker_microsites")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta la migración 014_broker_microsites.sql" }, { status: 503 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya tienes un micrositio o el link está ocupado" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const microsite = toMicrositeRecord(data);
  return NextResponse.json({
    microsite,
    public_url: buildMicrositePublicUrl(microsite.slug),
    created: true
  });
}

/** Sugerir slug desde nombre de marca */
export async function PUT(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name ?? "");
  const slug = slugifyBrandName(name);

  return NextResponse.json({ slug, valid: isValidMicrositeSlug(slug) });
}
