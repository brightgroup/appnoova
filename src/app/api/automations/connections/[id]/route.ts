import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById, updateConnectionInboundToken, updateConnectionWebhookUrl } from "@/lib/automations/connections-db";
import { automationInboundBaseUrl } from "@/lib/telephony/app-url";

type Ctx = { params: Promise<{ id: string }> };

function withCallbackBase<T extends { inboundToken: string }>(connection: T) {
  return { ...connection, callbackBaseUrl: automationInboundBaseUrl() };
}

function normalizeInboundPath(raw: string): string | null {
  const slug = raw.trim().replace(/^\/+|\/+$/g, "").replace(/\s+/g, "-");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(slug)) return null;
  return slug;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();
  const connection = await getConnectionById(db, orgCtx.organizationId, id);

  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ connection: withCallbackBase(connection) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const webhookUrl = body?.webhookUrl !== undefined ? String(body.webhookUrl).trim() : undefined;
  const inboundPath = body?.inboundPath !== undefined ? String(body.inboundPath) : undefined;

  if (webhookUrl === undefined && inboundPath === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const db = adminClient();

  if (webhookUrl !== undefined) {
    if (!webhookUrl) {
      return NextResponse.json({ error: "Falta la URL del webhook" }, { status: 400 });
    }
    try {
      new URL(webhookUrl);
    } catch {
      return NextResponse.json({ error: "La URL del webhook no es válida" }, { status: 400 });
    }
    const connection = await updateConnectionWebhookUrl(db, orgCtx.organizationId, id, webhookUrl);
    if (!connection) {
      return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ connection: withCallbackBase(connection) });
  }

  const token = normalizeInboundPath(inboundPath ?? "");
  if (!token) {
    return NextResponse.json(
      { error: "El path solo admite letras, números, punto, guion y guion bajo" },
      { status: 400 }
    );
  }

  try {
    const connection = await updateConnectionInboundToken(db, orgCtx.organizationId, id, token);
    if (!connection) {
      return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ connection: withCallbackBase(connection) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("inbound_token") || message.includes("duplicate") || message.includes("23505")) {
      return NextResponse.json({ error: "Ese path de entrada ya está en uso" }, { status: 409 });
    }
    return NextResponse.json({ error: message || "No se pudo guardar el path de entrada" }, { status: 500 });
  }
}
