import { NextRequest, NextResponse } from "next/server";
import { notifyAdminsLineRequest } from "@/lib/email/notify-line-request";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import type { PhoneLineRequestRecord } from "@/types/phone-line-request";

const VALID_TYPES = new Set(["purchase_line", "verify_outbound"]);

/** GET — solicitudes del usuario autenticado. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("phone_line_requests")
    .select("id, request_type, phone_e164, country_code, notes, status, voice_agent_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

/** POST — cliente solicita línea o verificación outbound. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const request_type = String(body.request_type ?? "");
  if (!VALID_TYPES.has(request_type)) {
    return NextResponse.json({ error: "request_type inválido" }, { status: 400 });
  }

  if (request_type === "verify_outbound" && !body.phone_e164) {
    return NextResponse.json({ error: "phone_e164 requerido para verificación" }, { status: 400 });
  }

  const db = adminClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("phone_line_requests")
    .insert({
      user_id: userId,
      voice_agent_id: body.voice_agent_id ?? null,
      request_type,
      phone_e164: body.phone_e164 ?? null,
      country_code: body.country_code ?? null,
      notes: body.notes ?? null,
      status: "pending",
      updated_at: now
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const request = data as PhoneLineRequestRecord;

  const [{ data: user }, agentRes] = await Promise.all([
    db.from("users").select("email, nombre").eq("id", userId).maybeSingle(),
    request.voice_agent_id
      ? db.from("voice_agents").select("name").eq("id", request.voice_agent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  notifyAdminsLineRequest({
    request,
    clientName: user?.nombre ?? null,
    clientEmail: user?.email ?? null,
    agentName: agentRes.data?.name ?? null
  }).catch(err => console.error("[line-request] notify failed:", err));

  return NextResponse.json({ request: data }, { status: 201 });
}
