import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { getWebhookBaseUrl } from "@/lib/telephony/app-url";
import { signedUrlForPath } from "@/lib/whatsapp/media-storage";
import { getConnectionSecretsById, markConnectionError } from "@/lib/automations/connections-db";
import { listActiveWorkflowsForOrg } from "@/lib/automations/workflows-db";
import { findWebhookActionConnectionIds } from "@/lib/automations/node-types";

const WEBHOOK_TIMEOUT_MS = 8000;

export interface EmitImageEventParams {
  organizationId: string;
  conversationId: string;
  contactPhone: string;
  contactLabel: string | null;
  mediaStoragePath: string | null;
  analysisText: string;
  messageSid: string;
}

/**
 * Recorre los workflows activos de la organización y, por cada nodo
 * `action.webhook` conectado a un disparador de imagen, envía el evento al
 * conector configurado — sin bloquear la respuesta al cliente final (el
 * llamador debe invocar esto con `void ... .catch(...)`, nunca `await`
 * en el camino crítico de la respuesta de WhatsApp).
 */
export async function emitAutomationEvent(
  db: SupabaseClient,
  params: EmitImageEventParams
): Promise<void> {
  const workflows = await listActiveWorkflowsForOrg(db, params.organizationId);
  if (workflows.length === 0) return;

  const imageUrl = params.mediaStoragePath
    ? await signedUrlForPath(db, params.mediaStoragePath)
    : null;

  for (const workflow of workflows) {
    const connectionIds = findWebhookActionConnectionIds(workflow.graph);
    for (const connectionId of connectionIds) {
      await sendWebhookEvent(db, {
        workflowId: workflow.id,
        connectionId,
        imageUrl,
        ...params
      });
    }
  }
}

interface SendWebhookEventParams extends EmitImageEventParams {
  workflowId: string;
  connectionId: string;
  imageUrl: string | null;
}

async function sendWebhookEvent(db: SupabaseClient, params: SendWebhookEventParams): Promise<void> {
  const connection = await getConnectionSecretsById(db, params.connectionId);
  if (!connection || connection.status !== "active") return;

  const payload = {
    event: "whatsapp.image_received",
    schema_version: "1",
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    correlation_id: `${params.conversationId}:${params.messageSid}`,
    contact: { phone: params.contactPhone, label: params.contactLabel },
    image: { url: params.imageUrl, analysis: params.analysisText },
    callback_url: `${getWebhookBaseUrl()}/api/automations/inbound/${connection.inboundToken}`
  };
  const body = JSON.stringify(payload);
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
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Noova-Signature": signature },
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
    event_type: "whatsapp.image_received",
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
