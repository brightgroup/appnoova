import {
  buildContentVariables,
  namedBodyToTwilio,
  twilioCategoryLabel
} from "@/lib/whatsapp/template-record";
import type { WhatsAppTemplateCategory } from "@/types/whatsapp-template";

function twilioCredentials(): { accountSid: string; authToken: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function twilioContentFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const creds = twilioCredentials();
  if (!creds) {
    throw new Error("Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }

  const res = await fetch(`https://content.twilio.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds.accountSid, creds.authToken),
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Twilio Content API error ${res.status}`);
  }
  return json;
}

export interface CreateTwilioTemplateInput {
  friendlyName: string;
  language: string;
  body: string;
  variableNames: string[];
  variableExamples: string[];
}

export interface TwilioContentResult {
  sid: string;
}

export async function createTwilioContentTemplate(
  input: CreateTwilioTemplateInput
): Promise<TwilioContentResult> {
  const variables: Record<string, string> = {};
  input.variableNames.forEach((name, i) => {
    variables[String(i + 1)] = input.variableExamples[i]?.trim() || name;
  });

  const json = await twilioContentFetch<{ sid: string }>("/Content", {
    method: "POST",
    body: JSON.stringify({
      friendly_name: input.friendlyName,
      language: input.language,
      variables,
      types: {
        "twilio/text": {
          body: input.body
        }
      }
    })
  });

  return { sid: String(json.sid) };
}

export interface CreateTwilioQuickReplyInput {
  friendlyName: string;
  language: string;
  body: string;
  /** Máximo 3 — límite de WhatsApp para mensajes de sesión (sin aprobación de plantilla). */
  actions: { id: string; title: string }[];
}

/**
 * Crea un Content de tipo `twilio/quick-reply` (botones táctiles) — Fase 2.5
 * (Camino A) del plan de Noova Seguros. Dentro de la ventana de 24h de
 * servicio al cliente NO requiere aprobación de plantilla; se crea un
 * Content nuevo por envío (la IA genera preguntas/opciones distintas cada
 * vez) y se manda de inmediato referenciando el SID — dos llamadas, no una,
 * a diferencia de Meta que manda todo inline en un solo POST.
 */
export async function createTwilioQuickReplyContent(
  input: CreateTwilioQuickReplyInput
): Promise<TwilioContentResult> {
  const json = await twilioContentFetch<{ sid: string }>("/Content", {
    method: "POST",
    body: JSON.stringify({
      friendly_name: input.friendlyName,
      language: input.language,
      types: {
        "twilio/quick-reply": {
          body: input.body,
          actions: input.actions
        }
      }
    })
  });
  return { sid: String(json.sid) };
}

export interface CreateTwilioListPickerInput {
  friendlyName: string;
  language: string;
  body: string;
  button: string;
  /** Máximo 10 — límite de WhatsApp. */
  items: { id: string; item: string; description?: string }[];
}

/** Crea un Content de tipo `twilio/list-picker` (lista de hasta 10 opciones) — mismas reglas que quick-reply. */
export async function createTwilioListPickerContent(
  input: CreateTwilioListPickerInput
): Promise<TwilioContentResult> {
  const json = await twilioContentFetch<{ sid: string }>("/Content", {
    method: "POST",
    body: JSON.stringify({
      friendly_name: input.friendlyName,
      language: input.language,
      types: {
        "twilio/list-picker": {
          body: input.body,
          button: input.button,
          items: input.items
        }
      }
    })
  });
  return { sid: String(json.sid) };
}

export async function submitTwilioTemplateForApproval(input: {
  contentSid: string;
  templateName: string;
  category: WhatsAppTemplateCategory;
}): Promise<void> {
  await twilioContentFetch(
    `/Content/${input.contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.templateName,
        category: twilioCategoryLabel(input.category)
      })
    }
  );
}

export type TwilioApprovalStatus =
  | "received"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "unsubmitted";

export interface TwilioApprovalResult {
  status: TwilioApprovalStatus;
  rejectionReason: string | null;
}

export async function fetchTwilioTemplateApproval(
  contentSid: string
): Promise<TwilioApprovalResult> {
  const json = await twilioContentFetch<{
    whatsapp?: { status?: string; rejection_reason?: string };
  }>(`/Content/${contentSid}/ApprovalRequests`);

  const status = String(json.whatsapp?.status ?? "pending").toLowerCase() as TwilioApprovalStatus;
  return {
    status,
    rejectionReason: json.whatsapp?.rejection_reason?.trim() || null
  };
}

export function mapTwilioApprovalToNoovaStatus(
  twilioStatus: TwilioApprovalStatus
): "pending_approval" | "approved" | "rejected" {
  if (twilioStatus === "approved") return "approved";
  if (twilioStatus === "rejected" || twilioStatus === "disabled") return "rejected";
  return "pending_approval";
}

export { buildContentVariables, namedBodyToTwilio };
