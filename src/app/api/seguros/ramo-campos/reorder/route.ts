import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { reorderCampos } from "@/lib/insurers/poliza-ramo-campos-db";

/** PUT { ordered_ids: string[] } — mismo patrón de reorder en bloque que CrmPropertyConfigPanel. */
export async function PUT(req: NextRequest) {
  const ctx = await requireSegurosAccess(req, "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.ordered_ids)) {
    return NextResponse.json({ error: "ordered_ids debe ser un arreglo" }, { status: 400 });
  }

  const db = adminClient();
  await reorderCampos(db, ctx.organizationId, body.ordered_ids.map(String));
  return NextResponse.json({ ok: true });
}
