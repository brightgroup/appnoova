import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { markInsurerConnectionResult, upsertInsurerConnection } from "@/lib/insurers/insurer-connections-db";
import { testLaEquidadConnection, type LaEquidadCredentials } from "@/lib/insurers/la-equidad";

export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const usuario = String(body?.usuario ?? "").trim();
  const contrasena = String(body?.contrasena ?? "").trim();

  if (!usuario || !contrasena) {
    return NextResponse.json({ error: "Falta usuario o contraseña" }, { status: 400 });
  }

  const credentials: LaEquidadCredentials = { usuario, contrasena };
  const testResult = await testLaEquidadConnection(credentials);
  if ("message" in testResult) {
    return NextResponse.json({ error: testResult.message }, { status: 400 });
  }

  const db = adminClient();
  try {
    const connection = await upsertInsurerConnection(db, {
      organizationId: orgCtx.organizationId,
      providerKey: "la_equidad",
      displayName: "La Equidad Seguros",
      credentials: credentials as unknown as Record<string, string>,
      connectedByUserId: orgCtx.userId
    });
    await markInsurerConnectionResult(db, connection.id, { ok: true });
    return NextResponse.json({ connection: { ...connection, status: "active" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión con La Equidad" },
      { status: 500 }
    );
  }
}
