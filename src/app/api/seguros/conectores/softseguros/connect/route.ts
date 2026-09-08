import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { upsertSoftsegurosConnection, markSoftsegurosConnectionResult } from "@/lib/softseguros/connections-db";
import { testSoftsegurosConnection } from "@/lib/softseguros/client";

export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "").trim();
  if (!username || !password) {
    return NextResponse.json({ error: "Falta usuario o contraseña" }, { status: 400 });
  }

  const testResult = await testSoftsegurosConnection({ username, password });
  if ("message" in testResult) {
    return NextResponse.json({ error: testResult.message }, { status: 400 });
  }

  const db = adminClient();
  try {
    const connection = await upsertSoftsegurosConnection(db, {
      organizationId: orgCtx.organizationId,
      credentials: { username, password },
      connectedByUserId: orgCtx.userId
    });
    await markSoftsegurosConnectionResult(db, orgCtx.organizationId, { ok: true });
    return NextResponse.json({ connection: { ...connection, status: "active" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión con Softseguros" },
      { status: 500 }
    );
  }
}
