import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { markInsurerConnectionResult, upsertInsurerConnection } from "@/lib/insurers/insurer-connections-db";

/** PlacApi solo pide una API key — se guarda cifrada, sin llamada de prueba (cada consulta real cuesta un crédito). */
export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const apiKey = String(body?.apiKey ?? "").trim();

  if (!apiKey) {
    return NextResponse.json({ error: "Falta la API key de PlacApi." }, { status: 400 });
  }

  const db = adminClient();
  try {
    const connection = await upsertInsurerConnection(db, {
      organizationId: orgCtx.organizationId,
      providerKey: "placapi",
      displayName: "PlacApi",
      credentials: { apiKey },
      connectedByUserId: orgCtx.userId
    });
    await markInsurerConnectionResult(db, connection.id, { ok: true });
    return NextResponse.json({ connection: { ...connection, status: "active" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión con PlacApi" },
      { status: 500 }
    );
  }
}
