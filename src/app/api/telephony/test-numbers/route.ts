import { NextRequest, NextResponse } from "next/server";
import { toE164 } from "@/lib/telephony/e164";
import {
  adminClient,
  getAuthUserFromRequest,
  getUserIdFromRequest,
  userDisplayName
} from "@/lib/voice-agents-server";

/** GET — números de prueba del usuario */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const activeOnly = req.nextUrl.searchParams.get("active") === "1";
  const db = adminClient();
  let query = db
    .from("test_phone_numbers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;

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
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const e164 = toE164(String(body.e164 ?? ""));
  const label = String(body.label ?? "Mi celular").trim() || "Mi celular";
  const displayName = userDisplayName(user);

  if (!e164 || e164.length < 8) {
    return NextResponse.json({ error: "Número inválido. Usa formato +57..." }, { status: 400 });
  }

  const db = adminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("test_phone_numbers")
    .upsert(
      {
        user_id: user.id,
        e164,
        label,
        active: true,
        created_by_name: displayName,
        updated_by_name: displayName,
        updated_at: now
      },
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

/** PATCH — editar nombre, número o estado. Body: { id, label?, e164?, active? } */
export async function PATCH(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const { id, label, e164, active } = body as {
    id?: string;
    label?: string;
    e164?: string;
    active?: boolean;
  };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_name: userDisplayName(user)
  };
  if (label !== undefined) updates.label = String(label).trim() || "Sin nombre";
  if (e164 !== undefined) {
    const normalized = toE164(String(e164));
    if (!normalized || normalized.length < 8) {
      return NextResponse.json({ error: "Número inválido" }, { status: 400 });
    }
    updates.e164 = normalized;
  }
  if (active !== undefined) updates.active = Boolean(active);

  const db = adminClient();
  const { data, error } = await db
    .from("test_phone_numbers")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
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
