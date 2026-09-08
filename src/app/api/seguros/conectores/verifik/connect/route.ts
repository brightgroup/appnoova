import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { markInsurerConnectionResult, upsertInsurerConnection } from "@/lib/insurers/insurer-connections-db";

/** Verifik solo pide un token (JWT de su panel) — se guarda cifrado, sin llamada de prueba (cada consulta real cuesta un crédito). */
export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();

  if (token.split(".").length !== 3) {
    return NextResponse.json({ error: "El token no tiene el formato de un JWT válido de Verifik." }, { status: 400 });
  }

  const db = adminClient();
  try {
    const connection = await upsertInsurerConnection(db, {
      organizationId: orgCtx.organizationId,
      providerKey: "verifik",
      displayName: "Verifik",
      credentials: { token },
      connectedByUserId: orgCtx.userId
    });
    await markInsurerConnectionResult(db, connection.id, { ok: true });
    return NextResponse.json({ connection: { ...connection, status: "active" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión con Verifik" },
      { status: 500 }
    );
  }
}
