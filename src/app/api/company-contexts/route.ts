import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import type { CompanyContext } from "@/types/company-context";

function toRecord(raw: Record<string, unknown>): CompanyContext {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    name: String(raw.name ?? ""),
    content: String(raw.content ?? ""),
    website_url: String(raw.website_url ?? ""),
    is_default: Boolean(raw.is_default),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? "")
  };
}

async function clearOtherDefaults(
  db: ReturnType<typeof adminClient>,
  organizationId: string,
  exceptId?: string
) {
  let q = db.from("company_contexts").update({ is_default: false }).eq("organization_id", organizationId);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

/**
 * GET /api/company-contexts → lista de la organización
 * GET /api/company-contexts?id= → uno
 * GET /api/company-contexts?default=1 → contexto por defecto
 */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "company_context", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;
  const orgId = orgCtx.organizationId;

  const db = adminClient();
  const id = req.nextUrl.searchParams.get("id");
  const wantDefault = req.nextUrl.searchParams.get("default") === "1";

  if (id) {
    const { data, error } = await db
      .from("company_contexts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ context: null, dbReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      context: data ? toRecord(data) : null,
      dbReady: true
    });
  }

  if (wantDefault) {
    const { data, error } = await db
      .from("company_contexts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ context: null, dbReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      context: data ? toRecord(data) : null,
      dbReady: true
    });
  }

  const { data, error } = await db
    .from("company_contexts")
    .select("*")
    .eq("organization_id", orgId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ contexts: [], dbReady: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    contexts: (data ?? []).map(toRecord),
    dbReady: true
  });
}

/** POST — crear o actualizar contexto */
export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "company_context", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;
  const userId = orgCtx.userId;
  const orgId = orgCtx.organizationId;

  const body = await req.json();
  const db = adminClient();
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    organization_id: orgId,
    name: String(body.name ?? "").trim() || "Mi marca",
    content: String(body.content ?? ""),
    website_url: String(body.website_url ?? "").trim(),
    is_default: Boolean(body.is_default),
    updated_at: now
  };

  if (body.is_default) {
    await clearOtherDefaults(db, orgId, body.id);
  }

  if (body.id) {
    const { data, error } = await db
      .from("company_contexts")
      .update(row)
      .eq("id", body.id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ context: toRecord(data) });
  }

  const { count } = await db
    .from("company_contexts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await db
    .from("company_contexts")
    .insert({ ...row, is_default: row.is_default || isFirst })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (row.is_default || isFirst) {
    await clearOtherDefaults(db, orgId, data.id);
  }

  return NextResponse.json({ context: toRecord(data), created: true });
}

/** DELETE /api/company-contexts?id= */
export async function DELETE(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "company_context", "manage");
  if (orgCtx instanceof NextResponse) return orgCtx;
  const orgId = orgCtx.organizationId;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { error } = await db
    .from("company_contexts")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
