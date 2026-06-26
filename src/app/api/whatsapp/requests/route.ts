import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { notifyAdminsWhatsAppRequest } from "@/lib/email/notify-whatsapp-request";

/** GET — solicitudes de WhatsApp del usuario autenticado. */
export async function GET(req: NextRequest) {
  const orgCtx = await getOrgContextFromRequest(req);
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const { data, error } = await db
    .from("whatsapp_line_requests")
    .select("*")
    .eq("organization_id", orgCtx.organizationId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}

/** POST — crear una nueva solicitud de línea WhatsApp. */
export async function POST(req: NextRequest) {
  const orgCtx = await getOrgContextFromRequest(req);
  if (orgCtx instanceof NextResponse) return orgCtx;

  let body: {
    text_agent_id?: string;
    phone_e164?: string;
    friendly_name?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { text_agent_id, phone_e164, friendly_name, notes } = body;

  const db = adminClient();

  // Verificar que el agente pertenezca a la organización si se proporciona
  if (text_agent_id) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", text_agent_id)
      .eq("organization_id", orgCtx.organizationId)
      .maybeSingle();
    
    if (!agent) {
      return NextResponse.json({ error: "Agente de texto no encontrado en esta organización" }, { status: 400 });
    }
  }

  const { data, error } = await db
    .from("whatsapp_line_requests")
    .insert({
      user_id: orgCtx.userId,
      organization_id: orgCtx.organizationId,
      text_agent_id: text_agent_id || null,
      phone_e164: phone_e164 || null,
      friendly_name: friendly_name || null,
      notes: notes || null,
      status: "pending"
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: profile }, agentRes] = await Promise.all([
    db.from("profiles").select("email, full_name").eq("id", orgCtx.userId).maybeSingle(),
    text_agent_id
      ? db.from("text_agents").select("name").eq("id", text_agent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  notifyAdminsWhatsAppRequest({
    request: data,
    clientName: profile?.full_name ?? null,
    clientEmail: profile?.email ?? null,
    organizationName: orgCtx.organizationName,
    agentName: agentRes.data?.name ?? null
  }).catch(err => console.error("[whatsapp/requests] notify failed:", err));

  return NextResponse.json({ request: data });
}
