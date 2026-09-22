import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOriBasePrompt, oriFactoryPrompt, saveOriBasePrompt } from "@/lib/ori/ori-prompt-settings";

/** Plantilla base de Ori — la que reciben todas las organizaciones. Solo superadmin. */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const prompt = await getOriBasePrompt(db);
  return NextResponse.json({ prompt, factory: oriFactoryPrompt() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "El prompt no puede quedar vacío" }, { status: 400 });
  }

  const db = adminClient();
  try {
    await saveOriBasePrompt(db, prompt, auth.userId);
    return NextResponse.json({ prompt, factory: oriFactoryPrompt() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al guardar" }, { status: 500 });
  }
}
