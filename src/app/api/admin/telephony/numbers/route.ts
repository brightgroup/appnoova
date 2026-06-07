import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { getTelephonyProvider } from "@/lib/telephony";
import { adminClient } from "@/lib/voice-agents-server";

/** GET — lista números (todos o filtrados por user_id). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const userId = new URL(req.url).searchParams.get("user_id");
  const db = adminClient();

  let query = db
    .from("phone_numbers")
    .select("*")
    .neq("status", "released")
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ phone_numbers: data ?? [] });
}

/** PATCH — reasignar agente. Body: { id, voice_agent_id } */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, voice_agent_id } = body as { id?: string; voice_agent_id?: string | null };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = adminClient();
  const { data: phone } = await db.from("phone_numbers").select("*").eq("id", id).maybeSingle();
  if (!phone || phone.status !== "active") {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }

  if (voice_agent_id) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("id")
      .eq("id", voice_agent_id)
      .eq("user_id", phone.user_id)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agente inválido para este usuario" }, { status: 400 });
    }
    await db
      .from("phone_numbers")
      .update({ voice_agent_id: null, updated_at: new Date().toISOString() })
      .eq("voice_agent_id", voice_agent_id)
      .eq("status", "active")
      .neq("id", id);
  }

  const { data, error } = await db
    .from("phone_numbers")
    .update({ voice_agent_id: voice_agent_id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ phone_number: data });
}

/** DELETE — libera número en proveedor y marca released. Body: { id } */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = adminClient();
  const { data: phone } = await db.from("phone_numbers").select("*").eq("id", id).maybeSingle();
  if (!phone || phone.status === "released") {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }

  const provider = getTelephonyProvider(phone.provider);
  try {
    if (phone.number_type === "purchased") {
      await provider.releaseNumber(phone.provider_sid);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al liberar en proveedor";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("phone_numbers")
    .update({ status: "released", voice_agent_id: null, released_at: now, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
