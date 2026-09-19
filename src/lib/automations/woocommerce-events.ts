import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getConnectionSecretsById, markConnectionError } from "@/lib/automations/connections-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import {
  findWooCommerceActionConfigs,
  type WooCommerceWebhookActionConfig
} from "@/lib/automations/node-types";

// Mismos valores que sendWebhookEvent en events.ts (motor de WhatsApp/HubSpot) — este emisor es
// independiente (WooCommerce no comparte el recorrido de 1 salto de ese archivo, ver
// findWooCommerceActionConfigs), pero reusa el mismo criterio de timeout/tamaño de log.
const WEBHOOK_TIMEOUT_MS = 20_000;
const LOGGED_BODY_MAX_CHARS = 8000;

export interface WooCommerceOrderEventData {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderTotal: string;
  customerName: string;
  customerPhone: string;
}

export interface WooCommerceProductEventData {
  productId: string;
  productName: string;
  productStock: string;
  productPrice: string;
}

export interface EmitWooCommerceOrderEventParams {
  organizationId: string;
  workflowId: string;
  triggerNodeId: string;
  order: WooCommerceOrderEventData;
}

export interface EmitWooCommerceProductEventParams {
  organizationId: string;
  workflowId: string;
  triggerNodeId: string;
  product: WooCommerceProductEventData;
}

/** Reemplaza tokens `{{nombre}}` por su valor, JSON-escapado — para usar dentro de comillas de un JSON ya armado por el usuario. Copiado de events.ts (mismo comportamiento, archivo independiente). */
function substituteTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = tokens[key] ?? "";
    return JSON.stringify(value).slice(1, -1);
  });
}

/**
 * Dispara el nodo `trigger.woocommerce_order` con id `triggerNodeId` dentro
 * del workflow indicado: si tiene algún `action.webhook` conectado, envía el
 * evento a cada conector configurado; si no, deja igual un registro
 * "captured" para que el botón de prueba del editor funcione desde el primer
 * momento (mismo criterio que `emitAutomationEvent` en events.ts).
 */
export async function emitWooCommerceOrderEvent(
  db: SupabaseClient,
  params: EmitWooCommerceOrderEventParams
): Promise<void> {
  const eventType = "woocommerce.order_updated";
  const tokens: Record<string, string> = {
    event: eventType,
    organization_id: params.organizationId,
    order_id: params.order.orderId,
    order_number: params.order.orderNumber,
    order_status: params.order.orderStatus,
    order_total: params.order.orderTotal,
    customer_name: params.order.customerName,
    customer_phone: params.order.customerPhone
  };

  await emitWooCommerceEvent(db, {
    organizationId: params.organizationId,
    workflowId: params.workflowId,
    triggerNodeId: params.triggerNodeId,
    triggerType: "trigger.woocommerce_order",
    eventType,
    tokens,
    buildAutoPayload: () => ({
      event: eventType,
      organization_id: params.organizationId,
      order: {
        id: params.order.orderId,
        number: params.order.orderNumber,
        status: params.order.orderStatus,
        total: params.order.orderTotal,
        customer_name: params.order.customerName,
        customer_phone: params.order.customerPhone
      }
    })
  });
}

/**
 * Igual que `emitWooCommerceOrderEvent`, pero para el nodo
 * `trigger.woocommerce_product`.
 */
export async function emitWooCommerceProductEvent(
  db: SupabaseClient,
  params: EmitWooCommerceProductEventParams
): Promise<void> {
  const eventType = "woocommerce.product_updated";
  const tokens: Record<string, string> = {
    event: eventType,
    organization_id: params.organizationId,
    product_id: params.product.productId,
    product_name: params.product.productName,
    product_stock: params.product.productStock,
    product_price: params.product.productPrice
  };

  await emitWooCommerceEvent(db, {
    organizationId: params.organizationId,
    workflowId: params.workflowId,
    triggerNodeId: params.triggerNodeId,
    triggerType: "trigger.woocommerce_product",
    eventType,
    tokens,
    buildAutoPayload: () => ({
      event: eventType,
      organization_id: params.organizationId,
      product: {
        id: params.product.productId,
        name: params.product.productName,
        stock: params.product.productStock,
        price: params.product.productPrice
      }
    })
  });
}

interface EmitWooCommerceEventInternalParams {
  organizationId: string;
  workflowId: string;
  triggerNodeId: string;
  triggerType: "trigger.woocommerce_order" | "trigger.woocommerce_product";
  eventType: string;
  /** Vocabulario de tokens `{{...}}` disponible en modo `customRequest` (ver requestBodyTemplate/requestHeadersJson). */
  tokens: Record<string, string>;
  /** Payload automático (modo no personalizado) — función porque solo se necesita si de verdad hay acciones o si se va a loguear como "captured". */
  buildAutoPayload: () => Record<string, unknown>;
}

async function emitWooCommerceEvent(db: SupabaseClient, params: EmitWooCommerceEventInternalParams): Promise<void> {
  const workflow = await getWorkflowById(db, params.organizationId, params.workflowId);
  if (!workflow) return;

  const allConfigs = findWooCommerceActionConfigs(workflow.graph, params.triggerType);
  const configs = allConfigs.filter((c) => c.triggerNodeId === params.triggerNodeId);

  if (configs.length === 0) {
    await logCapturedWooCommerceEvent(db, params);
    return;
  }

  for (const config of configs) {
    await sendWooCommerceWebhookEvent(db, params, config);
  }
}

/** Deja constancia de que un disparador de WooCommerce se activó con datos reales, aunque todavía no esté conectado a ningún conector — mismo criterio que `logCapturedTriggerEvent` en events.ts. */
async function logCapturedWooCommerceEvent(
  db: SupabaseClient,
  params: EmitWooCommerceEventInternalParams
): Promise<void> {
  const requestBody = JSON.stringify(params.buildAutoPayload());

  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId,
    event_type: params.eventType,
    status: "captured",
    request_body: requestBody.slice(0, LOGGED_BODY_MAX_CHARS)
  });
}

async function sendWooCommerceWebhookEvent(
  db: SupabaseClient,
  params: EmitWooCommerceEventInternalParams,
  config: WooCommerceWebhookActionConfig
): Promise<void> {
  const connection = await getConnectionSecretsById(db, config.connectionId);
  if (!connection || connection.status !== "active") return;

  let method = "POST";
  let extraHeaders: Record<string, string> = {};
  let body: string;

  if (config.customRequest && config.requestBodyTemplate?.trim()) {
    method = config.requestMethod || "POST";
    const substitutedBody = substituteTokens(config.requestBodyTemplate, params.tokens);
    try {
      JSON.parse(substitutedBody);
    } catch {
      await db.from("automation_event_log").insert({
        organization_id: params.organizationId,
        workflow_id: params.workflowId,
        connection_id: config.connectionId,
        event_type: params.eventType,
        status: "error",
        error_message: "El cuerpo personalizado no es JSON válido después de reemplazar las variables",
        request_body: substitutedBody.slice(0, LOGGED_BODY_MAX_CHARS)
      });
      return;
    }
    body = substitutedBody;

    if (config.requestHeadersJson?.trim()) {
      try {
        const parsedHeaders = JSON.parse(substituteTokens(config.requestHeadersJson, params.tokens));
        if (parsedHeaders && typeof parsedHeaders === "object") {
          extraHeaders = Object.fromEntries(
            Object.entries(parsedHeaders as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          );
        }
      } catch {
        // Headers personalizados inválidos: se ignoran, la solicitud sigue con los headers por defecto.
      }
    }
  } else {
    body = JSON.stringify(params.buildAutoPayload());
  }

  const signature = createHmac("sha256", connection.secret).update(body).digest("hex");

  const startedAt = Date.now();
  let status: "sent" | "error" = "sent";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let responseBodyText: string | null = null;

  // Un solo intento, sin reintento automático — mismo motivo que sendWebhookEvent en events.ts:
  // reintentar puede volver a ejecutar del lado del conector (n8n y similares) una acción con
  // efectos reales (ej. crear una tarea, notificar a un asesor), y no hay forma de confirmar
  // desde acá que el intento anterior no llegó a completarse.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(connection.webhookUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Noova-Signature": signature,
          "X-Noova-Api-Key": connection.secret,
          ...extraHeaders
        },
        body,
        signal: controller.signal
      });
      httpStatus = res.status;
      try {
        responseBodyText = (await res.text()).slice(0, LOGGED_BODY_MAX_CHARS);
      } catch {
        // Cuerpo de respuesta no legible (stream vacío, etc.) — no es crítico.
      }
      if (!res.ok) {
        status = "error";
        errorMessage = `HTTP ${res.status}`;
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : "Error de red desconocido";
  }

  const latencyMs = Date.now() - startedAt;

  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId,
    connection_id: config.connectionId,
    event_type: params.eventType,
    status,
    http_status: httpStatus,
    latency_ms: latencyMs,
    error_message: errorMessage,
    request_body: body.slice(0, LOGGED_BODY_MAX_CHARS),
    response_body: responseBodyText
  });

  if (status === "error") {
    await markConnectionError(db, config.connectionId, errorMessage ?? "Error desconocido").catch((err) =>
      console.warn("[automations] markConnectionError:", err)
    );
  }
}
