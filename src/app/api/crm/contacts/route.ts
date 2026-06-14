import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toCrmContact } from "@/lib/crm-record";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const db = textAgentsAdminClient();
  let query = db.from("crm_contacts").select("*").eq("user_id", userId).order("updated_at", { ascending: false });

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ contacts: [], dbReady: false }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: (data ?? []).map(r => toCrmContact(r)), dbReady: true });
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name es requerido" }, { status: 400 });

  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("crm_contacts")
    .insert({
      user_id: userId,
      name,
      email: body.email ? String(body.email).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      company: body.company ? String(body.company).trim() : null,
      job_title: body.job_title ? String(body.job_title).trim() : null,
      source: body.source ? String(body.source).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      tags: Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {}
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: toCrmContact(data) });
}
