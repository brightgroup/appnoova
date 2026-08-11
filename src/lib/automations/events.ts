import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getWebhookBaseUrl } from "@/lib/telephony/app-url";
import { signedUrlForPath } from "@/lib/whatsapp/media-storage";
import { getConnectionSecretsById, markConnectionError } from "@/lib/automations/connections-db";
import { listActiveWorkflowsForOrg } from "@/lib/automations/workflows-db";
import { findWebhookActionConfigs, type WebhookActionConfig, type WHATSAPP_TRIGGER_TYPES } from "@/lib/automations/node-types";

const WEBHOOK_TIMEOUT_MS = 8000;

export interface EmitWhatsAppEventParams {
  organizationId: string;
  conversationId: string;
  contactPhone: string;
  contactLabel: string | null;
  /** Solo aplica cuando triggerType es trigger.whatsapp_image. */
  mediaStoragePath: string | null;
  /** Análisis de la imagen (IA) o el texto del mensaje, según triggerType. */
  analysisText: string;
  messageSid: string;
  /** Canal de WhatsApp (whatsapp_channels.id) que recibió el mensaje — usado para filtrar disparadores atados a un canal específico. */
  channelId: string;
  /** Qué disparador de WhatsApp originó el evento — decide qué nodos del grafo se recorren y la forma del payload saliente. */
  triggerType: (typeof WHATSAPP_TRIGGER_TYPES)[number];
}

/**
 * Recorre los workflows activos de la organización y, por cada nodo
 * `action.webhook` conectado al disparador de WhatsApp correspondiente,
 * envía el evento al conector configurado — sin bloquear la respuesta al
 * cliente final (el llamador debe invocar esto con `void ... .catch(...)`,
 * nunca `await` en el camino crítico de la respuesta de WhatsApp).
 */
export async function emitAutomationEvent(
  db: SupabaseClient,
  params: EmitWhatsAppEventParams
): Promise<void> {
  const workflows = await listActiveWorkflowsForOrg(db, params.organizationId);
  if (workflows.length === 0) return;

  const imageUrl =
    params.triggerType === "trigger.whatsapp_image" && params.mediaStoragePath
      ? await signedUrlForPath(db, params.mediaStoragePath)
      : null;

  for (const workflow of workflows) {
    const actionConfigs = findWebhookActionConfigs(workflow.graph, params.triggerType, params.channelId);
    for (const config of actionConfigs) {
      await sendWebhookEvent(db, {
        workflowId: workflow.id,
        imageUrl,
        ...params,
        ...config
      });
    }
  }
}

interface SendWebhookEventParams extends EmitWhatsAppEventParams, WebhookActionConfig {
  workflowId: string;
  imageUrl: string | null;
}

/** Reemplaza tokens `{{nombre}}` por su valor, JSON-escapado — para usar dentro de comillas de un JSON ya armado por el usuario. */
function substituteTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = tokens[key] ?? "";
    return JSON.stringify(value).slice(1, -1);
  });
}

async function sendWebhookEvent(db: SupabaseClient, params: SendWebhookEventParams): Promise<void> {
  const connection = await getConnectionSecretsById(db, params.connectionId);
  if (!connection || connection.status !== "active") return;

  const isImage = params.triggerType === "trigger.whatsapp_image";
  const eventType = isImage ? "whatsapp.image_received" : "whatsapp.text_received";
  const callbackUrl = `${getWebhookBaseUrl()}/api/automations/inbound/${connection.inboundToken}`;

  let method = "POST";
  let extraHeaders: Record<string, string> = {};
  let body: string;

  if (params.customRequest && params.requestBodyTemplate?.trim()) {
    method = params.requestMethod || "POST";
    const tokens: Record<string, string> = {
      event: eventType,
      organization_id: params.organizationId,
      conversation_id: params.conversationId,
      correlation_id: `${params.conversationId}:${params.messageSid}`,
      contact_phone: params.contactPhone,
      contact_label: params.contactLabel ?? "",
      message_text: params.analysisText,
      image_url: params.imageUrl ?? "",
      callback_url: callbackUrl
    };

    const substitutedBody = substituteTokens(params.requestBodyTemplate, tokens);
    try {
      JSON.parse(substitutedBody);
    } catch {
      await db.from("automation_event_log").insert({
        organization_id: params.organizationId,
        workflow_id: params.workflowId,
        connection_id: params.connectionId,
        conversation_id: params.conversationId,
        event_type: eventType,
        status: "error",
        error_message: "El cuerpo personalizado no es JSON válido después de reemplazar las variables"
      });
      return;
    }
    body = substitutedBody;

    if (params.requestHeadersJson?.trim()) {
      try {
        const parsedHeaders = JSON.parse(substituteTokens(params.requestHeadersJson, tokens));
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
    const payload: Record<string, unknown> = {
      event: eventType,
      schema_version: "1",
      organization_id: params.organizationId,
      conversation_id: params.conversationId,
      correlation_id: `${params.conversationId}:${params.messageSid}`,
      contact: { phone: params.contactPhone, label: params.contactLabel },
      callback_url: callbackUrl
    };
    if (isImage) {
      payload.image = { url: params.imageUrl, analysis: params.analysisText };
    } else {
      payload.message = { text: params.analysisText };
    }
    body = JSON.stringify(payload);
  }

  const signature = createHmac("sha256", connection.secret).update(body).digest("hex");

  const startedAt = Date.now();
  let status: "sent" | "error" = "sent";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(connection.webhookUrl, {
        method,
        headers: { "Content-Type": "application/json", "X-Noova-Signature": signature, ...extraHeaders },
        body,
        signal: controller.signal
      });
      httpStatus = res.status;
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
    connection_id: params.connectionId,
    conversation_id: params.conversationId,
    event_type: eventType,
    status,
    http_status: httpStatus,
    latency_ms: latencyMs,
    error_message: errorMessage
  });

  if (status === "error") {
    await markConnectionError(db, params.connectionId, errorMessage ?? "Error desconocido").catch((err) =>
      console.warn("[automations] markConnectionError:", err)
    );
  }
}
