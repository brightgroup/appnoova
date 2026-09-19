import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getWebhookTriggerByToken } from "@/lib/automations/webhook-triggers-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { getActiveWooCommerceConnectionSecrets } from "@/lib/woocommerce/connections-db";
import { verifyWooCommerceWebhookSignature } from "@/lib/woocommerce/webhook-auth";
import { emitWooCommerceOrderEvent, emitWooCommerceProductEvent } from "@/lib/automations/woocommerce-events";

type Ctx = { params: Promise<{ token: string }> };

interface WooCommerceOrderPayload {
  id: number | string;
  number?: string;
  status?: string;
  total?: string;
  billing?: { first_name?: string; last_name?: string; phone?: string };
}

interface WooCommerceProductPayload {
  id: number | string;
  name?: string;
  stock_quantity?: number | string | null;
  price?: string;
}

/**
 * Callback público (sin sesión) que WooCommerce llama en cada webhook de la
 * tienda del cliente — el token siempre resuelve a un nodo
 * `trigger.woocommerce_order`/`trigger.woocommerce_product` dentro de un
 * workflow (URL propia generada al agregar el nodo, ver
 * `woocommerceOrderWebhookToken`/`woocommerceProductWebhookToken` en
 * node-types.ts), igual mecanismo que `/api/automations/hubspot/[token]`.
 *
 * A diferencia de ese webhook de HubSpot (que no verifica firma), aquí SÍ se
 * verifica `X-WC-Webhook-Signature` contra el secreto guardado en la conexión
 * de la organización — es una mejora real de seguridad, no solo paridad.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = textAgentsAdminClient();

  const rawBody = await req.text();

  const trigger = await getWebhookTriggerByToken(db, token);
  if (!trigger) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  const workflow = await getWorkflowById(db, trigger.organizationId, trigger.workflowId);
  const triggerNode = workflow?.graph.nodes.find(n => n.id === trigger.nodeId);
  if (!workflow || (triggerNode?.type !== "trigger.woocommerce_order" && triggerNode?.type !== "trigger.woocommerce_product")) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  const secrets = await getActiveWooCommerceConnectionSecrets(db, trigger.organizationId);
  if (!secrets?.webhookSecret) {
    return NextResponse.json({ error: "WooCommerce no está conectado para esta organización" }, { status: 404 });
  }

  const signatureHeader = req.headers.get("x-wc-webhook-signature");
  if (!verifyWooCommerceWebhookSignature(rawBody, signatureHeader, secrets.webhookSecret)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // WooCommerce no manda un id de entrega único y confiable en todas las versiones — se deriva uno
  // del cuerpo crudo (un reintento real de la MISMA entrega manda el mismo body byte a byte; un
  // evento nuevo, aunque sea del mismo pedido/producto, siempre difiere en algún campo — status,
  // total, stock, etc. — así que el hash sirve como dedup sin depender de un header que WooCommerce
  // podría no enviar).
  const deliveryId = createHash("sha1").update(rawBody).digest("hex");
  const { error: dedupError } = await db.from("woocommerce_processed_webhooks").insert({
    delivery_id: deliveryId,
    organization_id: trigger.organizationId,
    topic: triggerNode.type
  });
  if (dedupError) {
    // 23505 = unique_violation: ya se procesó este mismo cuerpo antes (reintento de WooCommerce).
    if (dedupError.code === "23505") {
      return NextResponse.json({ ok: true });
    }
    console.error("[woocommerce-webhook] dedup insert:", dedupError);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (triggerNode.type === "trigger.woocommerce_order") {
    const order = body as WooCommerceOrderPayload;
    void emitWooCommerceOrderEvent(db, {
      organizationId: trigger.organizationId,
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      order: {
        orderId: String(order.id ?? ""),
        orderNumber: order.number ?? "",
        orderStatus: order.status ?? "",
        orderTotal: order.total ?? "",
        customerName: `${order.billing?.first_name ?? ""} ${order.billing?.last_name ?? ""}`.trim(),
        customerPhone: order.billing?.phone ?? ""
      }
    }).catch(err => console.error("[woocommerce-webhook] emitWooCommerceOrderEvent:", err));
  } else {
    const product = body as WooCommerceProductPayload;
    void emitWooCommerceProductEvent(db, {
      organizationId: trigger.organizationId,
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      product: {
        productId: String(product.id ?? ""),
        productName: product.name ?? "",
        productStock: product.stock_quantity != null ? String(product.stock_quantity) : "",
        productPrice: product.price ?? ""
      }
    }).catch(err => console.error("[woocommerce-webhook] emitWooCommerceProductEvent:", err));
  }

  return NextResponse.json({ ok: true });
}
