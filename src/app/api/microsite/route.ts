import { NextRequest, NextResponse } from "next/server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { normalizeMicrositeForm, toMicrositeRecord } from "@/lib/microsite-record";
import { buildMicrositePublicUrl, isValidMicrositeSlug, slugifyBrandName } from "@/lib/microsite-slug";
import { getMicrositeById, listMicrositesForOrg } from "@/lib/microsite-server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { assertOrgHasAvailableLink, getOrgLinkSnapshot } from "@/lib/org-links";

async function validateRelations(
  db: ReturnType<typeof textAgentsAdminClient>,
  organizationId: string,
  companyContextId: string | null,
  textAgentId: string | null
): Promise<string | null> {
  if (companyContextId) {
    const { data } = await db
      .from("company_contexts")
      .select("id")
      .eq("id", companyContextId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return "Contexto de marca no encontrado";
  }

  if (textAgentId) {
    const { data } = await db
      .from("text_agents")
      .select("id")
      .eq("id", textAgentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return "Agente de texto no encontrado";
  }

  return null;
}

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = textAgentsAdminClient();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const microsite = await getMicrositeById(db, orgCtx.organizationId, id);
    if (!microsite) {
      return NextResponse.json({ error: "Mi Link no encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      microsite,
      public_url: buildMicrositePublicUrl(microsite.slug),
      dbReady: true
    });
  }

  const [microsites, links] = await Promise.all([
    listMicrositesForOrg(db, orgCtx.organizationId),
    getOrgLinkSnapshot(db, orgCtx.organizationId)
  ]);

  return NextResponse.json({ microsites, links, dbReady: true });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

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
  const relationErr = await validateRelations(db, orgCtx.organizationId, form.company_context_id, form.text_agent_id);
  if (relationErr) {
    return NextResponse.json({ error: relationErr }, { status: 400 });
  }

  const existing = body.id ? await getMicrositeById(db, orgCtx.organizationId, String(body.id)) : null;
  if (body.id && !existing) {
    return NextResponse.json({ error: "Mi Link no encontrado" }, { status: 404 });
  }

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
      .eq("organization_id", orgCtx.organizationId)
      .maybeSingle();
    companyContextId = agent?.company_context_id ? String(agent.company_context_id) : null;
  }

  const row = {
    user_id: orgCtx.userId,
    organization_id: orgCtx.organizationId,
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
      .eq("id", existing.id)
      .eq("organization_id", orgCtx.organizationId)
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

  const linkCheck = await assertOrgHasAvailableLink(db, orgCtx.organizationId);
  if (linkCheck.ok === false) {
    return NextResponse.json(
      { error: linkCheck.message, links: linkCheck.links },
      { status: 403 }
    );
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
      return NextResponse.json({ error: "Ese nombre de link ya está en uso" }, { status: 409 });
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

export async function DELETE(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "manage");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const existing = await getMicrositeById(db, orgCtx.organizationId, id);
  if (!existing) {
    return NextResponse.json({ error: "Mi Link no encontrado" }, { status: 404 });
  }

  const { error } = await db
    .from("broker_microsites")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgCtx.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
