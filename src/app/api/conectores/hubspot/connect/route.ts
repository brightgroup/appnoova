import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { fetchHubspotAccountInfo } from "@/lib/hubspot/account-info";
import { upsertHubspotPrivateAppConnection } from "@/lib/hubspot/connections-db";

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const token = String(body?.accessToken ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Falta el token de la Private App" }, { status: 400 });
  }

  let portalId: string | null;
  try {
    const info = await fetchHubspotAccountInfo(token);
    portalId = info.portalId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo validar el token con HubSpot" },
      { status: 400 }
    );
  }

  const db = adminClient();
  try {
    const connection = await upsertHubspotPrivateAppConnection(db, {
      organizationId: orgCtx.organizationId,
      connectedByUserId: orgCtx.userId,
      accessToken: token,
      portalId,
      hubDomain: null
    });
    return NextResponse.json({ connection });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión de HubSpot" },
      { status: 500 }
    );
  }
}
