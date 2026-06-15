import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";

export async function DELETE(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids es requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { error, count } = await db
    .from("crm_contacts")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? ids.length });
}
