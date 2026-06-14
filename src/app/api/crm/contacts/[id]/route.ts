import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { toCrmContact, toCrmLead } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const { data, error } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const { data: leads } = await db
    .from("crm_leads")
    .select("*, stage:crm_pipeline_stages(*)")
    .eq("user_id", userId)
    .eq("contact_id", id)
    .order("updated_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    contact: toCrmContact(data),
    leads: (leads ?? []).map(r => toCrmLead(r as Record<string, unknown>))
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of ["name", "email", "phone", "company", "job_title", "source", "notes"] as const) {
    if (body[key] !== undefined) updates[key] = body[key] ? String(body[key]).trim() : null;
  }
  if (Array.isArray(body.tags)) {
    updates.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
  }

  const db = textAgentsAdminClient();

  if (body.metadata !== undefined && typeof body.metadata === "object" && body.metadata !== null) {
    const { data: existing } = await db
      .from("crm_contacts")
      .select("metadata")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    const prev = (existing?.metadata as Record<string, unknown>) ?? {};
    updates.metadata = { ...prev, ...(body.metadata as Record<string, unknown>) };
  }

  const { data, error } = await db
    .from("crm_contacts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  return NextResponse.json({ contact: toCrmContact(data) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { error } = await db.from("crm_contacts").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
