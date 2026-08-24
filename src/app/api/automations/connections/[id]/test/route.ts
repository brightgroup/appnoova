import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getConnectionById, getConnectionSecretsById, markConnectionTested } from "@/lib/automations/connections-db";

type Ctx = { params: Promise<{ id: string }> };

// Mismo criterio que el envío real (ver WEBHOOK_TIMEOUT_MS en events.ts): varios workflows de n8n
// solo responden cuando termina todo el workflow, así que 8s marcaba como error integraciones sanas
// pero lentas. Se deja un poco más corto que el envío real porque aquí el usuario espera con un spinner.
const TEST_TIMEOUT_MS = 15_000;

/** Envía un ping firmado al webhook configurado, para que el cliente confirme que Noova lo alcanza. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const { id } = await ctx.params;
  const db = adminClient();

  const connection = await getConnectionById(db, orgCtx.organizationId, id);
  if (!connection) {
    return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
  }

  const secrets = await getConnectionSecretsById(db, id);
  if (!secrets) {
    return NextResponse.json({ error: "No se pudo leer el secreto del conector" }, { status: 500 });
  }

  const payload = { event: "ping", schema_version: "1", organization_id: orgCtx.organizationId };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secrets.secret).update(body).digest("hex");

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(connection.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Noova-Signature": signature },
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const latencyMs = Date.now() - startedAt;
    const ok = res.ok;
    await markConnectionTested(db, id, ok, ok ? undefined : `HTTP ${res.status}`);
    await db.from("automation_event_log").insert({
      organization_id: orgCtx.organizationId,
      connection_id: id,
      event_type: "connector.ping",
      status: ok ? "sent" : "error",
      http_status: res.status,
      latency_ms: latencyMs,
      error_message: ok ? null : `HTTP ${res.status}`,
      request_body: body
    });
    return NextResponse.json({ ok, httpStatus: res.status, latencyMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red desconocido";
    await markConnectionTested(db, id, false, message);
    await db.from("automation_event_log").insert({
      organization_id: orgCtx.organizationId,
      connection_id: id,
      event_type: "connector.ping",
      status: "error",
      error_message: message,
      request_body: body
    });
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
