import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgContextFromRequest } from "@/lib/org-server";

/** POST — elimina la suscripción push del dispositivo actual. */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint requerido" }, { status: 400 });
  }

  const db = adminClient();
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", ctx.userId);

  return NextResponse.json({ ok: true });
}
