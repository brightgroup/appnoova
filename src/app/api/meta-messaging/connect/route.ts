import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { connectMetaMessagingFromAuthCode } from "@/lib/meta-messaging/connect";
import { getMetaMessagingLoginConfig } from "@/lib/meta-messaging/login-config";

/** POST — finaliza "Conectar Messenger + Instagram" con el código del popup de Meta. */
export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  if (!getMetaMessagingLoginConfig().enabled) {
    return NextResponse.json({ error: "Conexión con Meta no configurada en el servidor" }, { status: 503 });
  }

  let body: { auth_code?: string; text_agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const authCode = body.auth_code?.trim();
  const textAgentId = body.text_agent_id?.trim();
  if (!authCode) return NextResponse.json({ error: "auth_code requerido" }, { status: 400 });
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
    const result = await connectMetaMessagingFromAuthCode(db, {
      organizationId: orgCtx.organizationId,
      userId: orgCtx.userId,
      textAgentId,
      authCode
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
