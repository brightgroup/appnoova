import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getWebhookTriggerByToken } from "@/lib/automations/webhook-triggers-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { runHubspotMessageEvent, type HubspotConversationEvent } from "@/lib/automations/hubspot-runner";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Callback público (sin sesión) que HubSpot llama para cada suscripción de
 * webhook de una Private App — el cliente pega esta URL al configurar la
 * suscripción `conversation.newMessage` en su portal. El token siempre
 * resuelve a un nodo `trigger.hubspot_message` dentro de un workflow (URL
 * propia generada al agregar el nodo, ver `hubspotWebhookToken` en
 * node-types.ts) — mismo mecanismo que `/api/automations/inbound/[token]`,
 * pero para el motor de HubSpot en vez del de WhatsApp.
 *
 * HubSpot manda un arreglo de eventos por request y espera una respuesta
 * rápida (timeout ~10s, ver header `x-hubspot-timeout-millis`) — por eso se
 * responde primero y el procesamiento real corre después, sin bloquear.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = textAgentsAdminClient();

  const rawBody = await req.text();
  let events: unknown;
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: "Se esperaba un arreglo de eventos" }, { status: 400 });
  }

  const trigger = await getWebhookTriggerByToken(db, token);
  if (!trigger) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  const workflow = await getWorkflowById(db, trigger.organizationId, trigger.workflowId);
  const triggerNode = workflow?.graph.nodes.find((n) => n.id === trigger.nodeId);
  if (!workflow || triggerNode?.type !== "trigger.hubspot_message") {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  for (const rawEvent of events) {
    const event = rawEvent as Partial<HubspotConversationEvent>;
    if (event.subscriptionType !== "conversation.newMessage" || !event.messageId || event.objectId == null) continue;

    void runHubspotMessageEvent(db, {
      organizationId: trigger.organizationId,
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      event: event as HubspotConversationEvent
    }).catch((err) => console.error("[hubspot-webhook] runHubspotMessageEvent:", err));
  }

  return NextResponse.json({ ok: true });
}
