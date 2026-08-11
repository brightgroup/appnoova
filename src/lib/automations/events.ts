import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getWebhookBaseUrl } from "@/lib/telephony/app-url";
import { signedUrlForPath } from "@/lib/whatsapp/media-storage";
import { getConnectionSecretsById, markConnectionError } from "@/lib/automations/connections-db";
import { listActiveWorkflowsForOrg } from "@/lib/automations/workflows-db";
import {
  findWebhookActionConfigs,
  findMatchingWhatsAppTriggerNodeIds,
  type WebhookActionConfig,
  type WhatsAppEventMediaType
} from "@/lib/automations/node-types";

const WEBHOOK_TIMEOUT_MS = 8000;
/** Cuánto del payload/respuesta se guarda para inspección en la UI — evita que un conector que devuelva HTML gigante llene la tabla. */
const LOGGED_BODY_MAX_CHARS = 8000;

export interface EmitWhatsAppEventParams {
  organizationId: string;
  conversationId: string;
  contactPhone: string;
  contactLabel: string | null;
  /** Solo aplica cuando mediaType es "image". */
  mediaStoragePath: string | null;
  /** Análisis de la imagen (IA) o el texto del mensaje, según mediaType. */
  analysisText: string;
  messageSid: string;
  /** Canal de WhatsApp (whatsapp_channels.id) que recibió el mensaje — usado para filtrar disparadores atados a un canal específico. */
  channelId: string;
  /** Qué llegó realmente por WhatsApp — decide qué disparadores del grafo aplican y la forma del payload saliente. */
  mediaType: WhatsAppEventMediaType;
}

/**
 * Recorre los workflows activos de la organización. Para cada uno con un
 * disparador de WhatsApp que aplique a este evento (canal + imagen/texto):
 * si tiene un nodo `action.webhook` conectado, envía el evento al conector
 * configurado; si no, igual deja un registro "captured" con el JSON real —
 * así el botón "Escuchar evento de prueba" del editor funciona con datos
 * reales desde el primer momento, sin esperar a que el workflow esté
 * terminado. Nunca bloquea la respuesta al cliente final (el llamador debe
 * invocar esto con `void ... .catch(...)`, nunca `await` en el camino
 * crítico de la respuesta de WhatsApp).
 */
export async function emitAutomationEvent(
  db: SupabaseClient,
  params: EmitWhatsAppEventParams
): Promise<void> {
  const workflows = await listActiveWorkflowsForOrg(db, params.organizationId);
  if (workflows.length === 0) return;

  const imageUrl =
    params.mediaType === "image" && params.mediaStoragePath
      ? await signedUrlForPath(db, params.mediaStoragePath)
      : null;
  const eventType = params.mediaType === "image" ? "whatsapp.image_received" : "whatsapp.text_received";

  for (const workflow of workflows) {
    const matchingTriggerIds = findMatchingWhatsAppTriggerNodeIds(workflow.graph, params.mediaType, params.channelId);
    if (matchingTriggerIds.length === 0) continue;

    const actionConfigs = findWebhookActionConfigs(workflow.graph, params.mediaType, params.channelId);
    if (actionConfigs.length === 0) {
      await logCapturedTriggerEvent(db, { workflowId: workflow.id, imageUrl, eventType, ...params });
      continue;
    }

    for (const config of actionConfigs) {
      await sendWebhookEvent(db, {
        workflowId: workflow.id,
        imageUrl,
        eventType,
        ...params,
        ...config
      });
    }
  }
}

interface CapturedTriggerEventParams extends EmitWhatsAppEventParams {
  workflowId: string;
  imageUrl: string | null;
  eventType: string;
}

/** Deja constancia de que un disparador de WhatsApp se activó con datos reales, aunque todavía no esté conectado a ningún conector. */
async function logCapturedTriggerEvent(db: SupabaseClient, params: CapturedTriggerEventParams): Promise<void> {
  const requestBody = JSON.stringify(
    params.eventType === "whatsapp.image_received"
      ? {
          event: params.eventType,
          conversation_id: params.conversationId,
          contact: { phone: params.contactPhone, label: params.contactLabel },
          image: { url: params.imageUrl, analysis: params.analysisText }
        }
      : {
          event: params.eventType,
          conversation_id: params.conversationId,
          contact: { phone: params.contactPhone, label: params.contactLabel },
          message: { text: params.analysisText }
        }
  );

  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId,
    conversation_id: params.conversationId,
    event_type: params.eventType,
    status: "captured",
    request_body: requestBody.slice(0, LOGGED_BODY_MAX_CHARS)
  });
}

interface SendWebhookEventParams extends EmitWhatsAppEventParams, WebhookActionConfig {
  workflowId: string;
  imageUrl: string | null;
  eventType: string;
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

  const isImage = params.mediaType === "image";
  const eventType = params.eventType;
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
        error_message: "El cuerpo personalizado no es JSON válido después de reemplazar las variables",
        request_body: substitutedBody.slice(0, LOGGED_BODY_MAX_CHARS)
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
  let responseBodyText: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(connection.webhookUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Noova-Signature": signature,
          // Header plano equivalente a un API key — para usar la credencial "Header Auth" de n8n sin código.
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
    connection_id: params.connectionId,
    conversation_id: params.conversationId,
    event_type: eventType,
    status,
    http_status: httpStatus,
    latency_ms: latencyMs,
    error_message: errorMessage,
    request_body: body.slice(0, LOGGED_BODY_MAX_CHARS),
    response_body: responseBodyText
  });

  if (status === "error") {
    await markConnectionError(db, params.connectionId, errorMessage ?? "Error desconocido").catch((err) =>
      console.warn("[automations] markConnectionError:", err)
    );
  }
}
