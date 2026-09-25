import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { connectMetaMessagingFromUserToken } from "@/lib/meta-messaging/connect";
import { getMetaMessagingLoginConfig } from "@/lib/meta-messaging/login-config";

/** POST — finaliza "Conectar Messenger + Instagram" con el token de usuario del popup de Meta. */
export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  if (!getMetaMessagingLoginConfig().enabled) {
    return NextResponse.json({ error: "Conexión con Meta no configurada en el servidor" }, { status: 503 });
  }

  let body: { user_access_token?: string; text_agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userAccessToken = body.user_access_token?.trim();
  const textAgentId = body.text_agent_id?.trim();
  if (!userAccessToken) return NextResponse.json({ error: "user_access_token requerido" }, { status: 400 });
  if (!textAgentId) return NextResponse.json({ error: "Elige el agente que atenderá estos canales" }, { status: 400 });

  const db = textAgentsAdminClient();
  const { data: agent } = await db
    .from("text_agents")
    .select("id")
    .eq("id", textAgentId)
    .eq("organization_id", orgCtx.organizationId)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agente no encontrado en tu organización" }, { status: 404 });

  try {
    const result = await connectMetaMessagingFromUserToken(db, {
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
      textAgentId,
      userAccessToken
    });
    if (!result.connected.length) {
      return NextResponse.json(
        { error: result.issues[0]?.message ?? "No se pudo conectar ningún canal", result },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[meta-messaging/connect]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al conectar con Meta" },
      { status: 500 }
    );
  }
}
