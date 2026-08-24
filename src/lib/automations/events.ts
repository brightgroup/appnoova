import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { signedUrlForPath } from "@/lib/whatsapp/media-storage";
import { getConnectionSecretsById, markConnectionError } from "@/lib/automations/connections-db";
import { listActiveWorkflowsForOrg } from "@/lib/automations/workflows-db";
import {
  findWebhookActionConfigs,
  findMatchingWhatsAppTriggerNodeIds,
  getConnectedAiExtractConfig,
  type WebhookActionConfig,
  type WhatsAppEventMediaType
} from "@/lib/automations/node-types";
import { runFieldExtraction } from "@/lib/automations/extract";
import type { ExtractFileInput } from "@/lib/automations/ai-extract-engine";
import { recordUsageSafe } from "@/lib/billing/meter";
import { providerForLlmModel } from "@/lib/billing/pricing";

// 20s en vez de un timeout más corto porque este envío es "fire and forget" (nunca se espera
// desde la respuesta al usuario de WhatsApp) y varios workflows de n8n responden solo cuando
// termina todo el workflow — un timeout corto genera falsos "error" en integraciones lentas pero sanas.
const WEBHOOK_TIMEOUT_MS = 20_000;
/** Reintentos ante fallas transitorias (sin respuesta / error 5xx del otro lado) — un 4xx no se reintenta porque repetir el mismo request no lo arregla. */
const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2000, 6000];
/** Cuánto del payload/respuesta se guarda para inspección en la UI — evita que un conector que devuelva HTML gigante llene la tabla. */
const LOGGED_BODY_MAX_CHARS = 8000;

export interface EmitWhatsAppEventParams {
  organizationId: string;
  conversationId: string;
  contactPhone: string;
  contactLabel: string | null;
  /** Solo aplica cuando mediaType es "image" o "document". */
  mediaStoragePath: string | null;
  /** Mime real del archivo (solo aplica cuando mediaType es "image" o "document") — para poder descargarlo y mandarlo tal cual al nodo de extracción con IA, sin depender del header de la URL firmada. */
  mediaMime: string | null;
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

  const hasFile = params.mediaType === "image" || params.mediaType === "document";
  const mediaUrl = hasFile && params.mediaStoragePath ? await signedUrlForPath(db, params.mediaStoragePath) : null;
  const eventType =
    params.mediaType === "image"
      ? "whatsapp.image_received"
      : params.mediaType === "document"
        ? "whatsapp.document_received"
        : "whatsapp.text_received";

  // Archivo real (no la descripción en texto) para el nodo de extracción con IA — se baja una
  // sola vez por evento, no por workflow, reusando la misma URL firmada que ya se calculó para
  // el payload del webhook. Si falla, `file` queda undefined y la extracción cae a analysisText
  // (ver runFieldExtraction) en vez de tumbar el evento completo.
  let file: ExtractFileInput | undefined;
  if (hasFile && mediaUrl && params.mediaMime) {
    try {
      const res = await fetch(mediaUrl);
      file = { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType: params.mediaMime };
    } catch (err) {
      console.warn(
        "[automations] no se pudo descargar el archivo para extracción con IA, se usa el texto ya interpretado:",
        err instanceof Error ? err.message : err
      );
    }
  }

  for (const workflow of workflows) {
    const matchingTriggerIds = findMatchingWhatsAppTriggerNodeIds(workflow.graph, params.mediaType, params.channelId);
    if (matchingTriggerIds.length === 0) continue;

    // Extracción estructurada con IA (opcional, nodo action.ai_extract conectado
    // al disparador): corre una sola vez por workflow, antes de armar el
    // payload — nunca bloquea ni se mezcla con la respuesta al cliente final,
    // que ya salió por otro camino antes de llegar acá.
    const extractConfig = getConnectedAiExtractConfig(workflow.graph, matchingTriggerIds[0]);
    let extracted: Record<string, unknown> | null = null;
    let extractError: string | undefined;
    if (extractConfig) {
      const extraction = await runFieldExtraction(
        extractConfig.fields,
        params.analysisText,
        params.mediaType,
        extractConfig.model,
        file,
        extractConfig.generalInstruction
      );
      extracted = extraction.extracted;
      extractError = extraction.error;
      if (extractError) {
        console.warn("[automations] extracción de campos falló:", JSON.stringify({ workflowId: workflow.id, extractError }));
      }
      // Consumo real del modelo elegido en el nodo — se cobra siempre que la llamada
      // realmente se hizo (haya devuelto JSON o no), sin importar si el evento termina
      // en un webhook conectado o solo queda "capturado" para pruebas en el editor.
      if (extraction.model) {
        await recordUsageSafe({
          db,
          organizationId: params.organizationId,
          eventType: "automation_extract",
          channel: "automations",
          provider: providerForLlmModel(extraction.model),
          model: extraction.model,
          gemini: extraction.usage,
          referenceType: "text_agent_conversation",
          referenceId: params.conversationId,
          idempotencyKey: `automation_extract_${workflow.id}_${params.messageSid}`
        });
      }
    }

    const actionConfigs = findWebhookActionConfigs(workflow.graph, params.mediaType, params.channelId);
    if (actionConfigs.length === 0) {
      await logCapturedTriggerEvent(db, { workflowId: workflow.id, mediaUrl, eventType, extracted, extractError, ...params });
      continue;
    }

    for (const config of actionConfigs) {
      await sendWebhookEvent(db, {
        workflowId: workflow.id,
        mediaUrl,
        eventType,
        extracted,
        extractError,
        ...params,
        ...config
      });
    }
  }
}

interface CapturedTriggerEventParams extends EmitWhatsAppEventParams {
  workflowId: string;
  mediaUrl: string | null;
  eventType: string;
  extracted: Record<string, unknown> | null;
  extractError?: string;
}

/** Deja constancia de que un disparador de WhatsApp se activó con datos reales, aunque todavía no esté conectado a ningún conector. */
async function logCapturedTriggerEvent(db: SupabaseClient, params: CapturedTriggerEventParams): Promise<void> {
  const requestBody = JSON.stringify({
    event: params.eventType,
    conversation_id: params.conversationId,
    contact: { phone: params.contactPhone, label: params.contactLabel },
    ...(params.eventType === "whatsapp.image_received"
      ? { image: { url: params.mediaUrl, analysis: params.analysisText } }
      : params.eventType === "whatsapp.document_received"
        ? { document: { url: params.mediaUrl, analysis: params.analysisText } }
        : { message: { text: params.analysisText } }),
    ...(params.extracted ? { extracted: params.extracted } : {}),
    ...(params.extractError ? { extract_error: params.extractError } : {})
  });

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
  mediaUrl: string | null;
  eventType: string;
  extracted: Record<string, unknown> | null;
  extractError?: string;
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
  const isDocument = params.mediaType === "document";
  const eventType = params.eventType;

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
      image_url: isImage ? params.mediaUrl ?? "" : "",
      document_url: isDocument ? params.mediaUrl ?? "" : ""
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
      contact: { phone: params.contactPhone, label: params.contactLabel }
    };
    if (isImage) {
      payload.image = { url: params.mediaUrl, analysis: params.analysisText };
    } else if (isDocument) {
      payload.document = { url: params.mediaUrl, analysis: params.analysisText };
    } else {
      payload.message = { text: params.analysisText };
    }
    if (params.extracted) payload.extracted = params.extracted;
    if (params.extractError) payload.extract_error = params.extractError;
    body = JSON.stringify(payload);
  }

  const signature = createHmac("sha256", connection.secret).update(body).digest("hex");

  const startedAt = Date.now();
  let status: "sent" | "error" = "sent";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let responseBodyText: string | null = null;
  let attempt = 0;

  while (attempt < MAX_SEND_ATTEMPTS) {
    attempt++;
    status = "sent";
    httpStatus = null;
    errorMessage = null;
    responseBodyText = null;

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

    // Solo vale la pena reintentar una falla transitoria (sin respuesta, o un 5xx del otro lado).
    // Un 4xx significa que la config está mal (URL, auth) — repetir el mismo request no lo arregla.
    const retryable = status === "error" && (httpStatus === null || httpStatus >= 500);
    if (!retryable || attempt >= MAX_SEND_ATTEMPTS) break;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
  }

  if (status === "error" && attempt > 1) {
    errorMessage = `${errorMessage} (tras ${attempt} intentos)`;
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
