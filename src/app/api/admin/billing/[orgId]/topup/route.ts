import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** POST — ajuste manual de créditos (positivo = añadir, negativo = quitar) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  const db = adminClient();

  const body = (await req.json()) as { credits: number; reason?: string };

  if (typeof body.credits !== "number" || body.credits === 0) {
    return NextResponse.json({ error: "credits debe ser un número distinto de 0" }, { status: 400 });
  }

  const { error } = await db.rpc("billing_admin_add_credits", {
    p_org:     orgId,
    p_credits: Math.round(body.credits),
    p_reason:  body.reason || "Ajuste manual admin",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
