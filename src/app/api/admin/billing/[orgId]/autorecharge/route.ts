import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";

/** POST { admin_enabled } — interruptor general del superadmin para la recarga automática de una org. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  const body = (await req.json().catch(() => null)) as { admin_enabled?: boolean } | null;
  if (!body || typeof body.admin_enabled !== "boolean") {
    return NextResponse.json({ error: "admin_enabled (boolean) requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { error } = await db.from("organization_autorecharge").upsert({
    organization_id: orgId,
    admin_enabled: body.admin_enabled,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
