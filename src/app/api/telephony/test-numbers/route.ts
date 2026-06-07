import { NextRequest, NextResponse } from "next/server";
import { toE164 } from "@/lib/telephony/e164";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";

/** GET — números de prueba del usuario */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("test_phone_numbers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({
        test_numbers: [],
        dbReady: false,
        error: "Ejecuta la migración 010_test_phone_numbers.sql en Supabase"
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ test_numbers: data ?? [], dbReady: true });
}

/** POST — crear número de prueba. Body: { e164, label? } */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const e164 = toE164(String(body.e164 ?? ""));
  const label = String(body.label ?? "Mi celular").trim() || "Mi celular";

  if (!e164 || e164.length < 8) {
    return NextResponse.json({ error: "Número inválido. Usa formato +57..." }, { status: 400 });
  }

  const db = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("test_phone_numbers")
    .upsert(
      { user_id: userId, e164, label, updated_at: now },
      { onConflict: "user_id,e164" }
    )
    .select("*")
    .single();

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({
        error: "Ejecuta la migración 010_test_phone_numbers.sql en Supabase"
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ test_number: data });
}

/** DELETE — eliminar número de prueba. Body: { id } */
export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = adminClient();
  const { error } = await db
    .from("test_phone_numbers")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
