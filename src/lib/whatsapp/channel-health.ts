import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgServiceBlock } from "@/lib/billing/org-service-gate";
import { markOrgWhatsAppChannelsPendingReactivation } from "@/lib/whatsapp/billing-lifecycle";
import { syncTwilioWhatsAppChannel } from "@/lib/whatsapp/twilio-channel-sync";
import {
  configureTwilioWhatsAppSenderWebhook,
  findTwilioSenderByE164,
  listTwilioWhatsAppSenders
} from "@/lib/whatsapp/twilio-senders";
import { twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";
import { notifyAdminsWhatsAppHealth } from "@/lib/email/notify-whatsapp-health";

/**
 * Auto-reparación de líneas WhatsApp (Twilio).
 *
 * Por qué existe: si el webhook del sender en Twilio no apunta a Noova, Twilio
 * recibe los mensajes del cliente pero nunca nos los entrega — sin error, sin
 * alerta, sin nada en el inbox. Pasó con Mil hojaldres (2026-09-29 → 10-02):
 * la suspensión por mora desvinculó el webhook, el pago dejó la línea en
 * "pending" y nadie la reactivó. Este chequeo corre cada 15 min y:
 *  - reactiva líneas suspendidas/pendientes por facturación de orgs ya al día
 *  - re-vincula el webhook de líneas activas cuyo callback no es el de Noova
 *  - avisa por email a los admins de Noova de cada reparación o fallo
 */

export type ChannelHealthAction =
  | "ok"
  | "reactivated"
  | "webhook_repaired"
  | "failed"
  | "skipped";

export interface ChannelHealthEntry {
  channelId: string;
  organizationId: string | null;
  organizationName: string | null;
  e164: string;
  action: ChannelHealthAction;
  detail?: string;
}

/** No re-alertar el mismo fallo persistente más de una vez al día. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface ChannelRow {
  id: string;
  organization_id: string | null;
  e164: string;
  status: string;
  provider: string | null;
  twilio_subaccount_sid: string | null;
  twilio_subaccount_auth_token: string | null;
  metadata: Record<string, unknown> | null;
}

function metaOf(row: ChannelRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? { ...row.metadata }
    : {};
}

async function credentialsFor(
  db: SupabaseClient,
  row: ChannelRow
): Promise<{ accountSid: string; authToken: string } | null> {
  let accountSid = String(row.twilio_subaccount_sid ?? "").trim();
  let authToken = String(row.twilio_subaccount_auth_token ?? "").trim();
  if ((!accountSid || !authToken) && row.organization_id) {
    const { data: org } = await db
      .from("organizations")
      .select("twilio_subaccount_sid, twilio_subaccount_auth_token")
      .eq("id", row.organization_id)
      .maybeSingle();
    accountSid = accountSid || String(org?.twilio_subaccount_sid ?? "").trim();
    authToken = authToken || String(org?.twilio_subaccount_auth_token ?? "").trim();
  }
  return accountSid && authToken ? { accountSid, authToken } : null;
}

async function currentStatus(db: SupabaseClient, channelId: string): Promise<string | null> {
  const { data } = await db.from("whatsapp_channels").select("status").eq("id", channelId).maybeSingle();
  return data?.status ? String(data.status) : null;
}

async function checkChannel(db: SupabaseClient, row: ChannelRow): Promise<Omit<ChannelHealthEntry, "organizationName">> {
  const base = { channelId: row.id, organizationId: row.organization_id, e164: row.e164 };
  const meta = metaOf(row);

  // Cuenta suspendida/desactivada: la línea debe estar apagada; no es un fallo.
  if (await getOrgServiceBlock(db, row.organization_id)) {
    return { ...base, action: "skipped", detail: "organización suspendida" };
  }

  const creds = await credentialsFor(db, row);
  if (!creds) return { ...base, action: "skipped", detail: "sin credenciales Twilio" };

  // 1) Suspendida por facturación pero la org ya está al día (pago por una ruta
  //    que no reactivó WhatsApp, p. ej. Paddle o un pago anterior a este fix).
  if (row.status === "suspended" && meta.billing_suspended_at && !meta.disconnected_at) {
    if (row.organization_id) {
      await markOrgWhatsAppChannelsPendingReactivation(db, row.organization_id);
    }
    const status = await currentStatus(db, row.id);
    return status === "active"
      ? { ...base, action: "reactivated", detail: "suspendida por facturación con la cuenta ya al día" }
      : { ...base, action: "failed", detail: `no se pudo reactivar (estado: ${status ?? "?"})` };
  }

  // 2) Quedó "pending" tras el pago (flujo viejo de reactivación manual).
  if (row.status === "pending" && meta.billing_reactivation_pending) {
    const sync = await syncTwilioWhatsAppChannel(db, row.id);
    return sync.activated
      ? { ...base, action: "reactivated", detail: "pendiente de reactivación tras el pago" }
      : {
          ...base,
          action: "failed",
          detail: `pendiente tras el pago; sender ${sync.senderStatus ?? "desconocido"}, webhook ${sync.webhookConfigured ? "ok" : "sin configurar"}`
        };
  }

  if (row.status !== "active") return { ...base, action: "skipped", detail: `estado ${row.status}` };

  // 3) Línea activa: el webhook del sender tiene que apuntar a Noova.
  const senders = await listTwilioWhatsAppSenders(creds);
  const sender = findTwilioSenderByE164(senders, row.e164);
  if (!sender) return { ...base, action: "failed", detail: "el sender no existe en la subcuenta Twilio" };

  const expected = twilioWhatsAppWebhookUrl();
  const actual = String(sender.webhook?.callback_url ?? "").trim();
  if (actual !== expected) {
    await configureTwilioWhatsAppSenderWebhook({ e164: row.e164, ...creds });
    return { ...base, action: "webhook_repaired", detail: `callback era "${actual || "(vacío)"}"` };
  }

  if (sender.status && sender.status !== "ONLINE") {
    return { ...base, action: "failed", detail: `sender en Twilio está ${sender.status}` };
  }

  return { ...base, action: "ok" };
}

/** Guarda el último problema en metadata y decide si toca alertar (cooldown). */
async function shouldAlert(db: SupabaseClient, entry: ChannelHealthEntry): Promise<boolean> {
  if (entry.action === "reactivated" || entry.action === "webhook_repaired") return true;
  if (entry.action !== "failed") return false;

  const { data } = await db.from("whatsapp_channels").select("metadata").eq("id", entry.channelId).maybeSingle();
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {};
  const last = typeof meta.health_alerted_at === "string" ? Date.parse(meta.health_alerted_at) : 0;
  const sameIssue = meta.health_last_issue === entry.detail;
  if (sameIssue && last && Date.now() - last < ALERT_COOLDOWN_MS) return false;

  meta.health_alerted_at = new Date().toISOString();
  meta.health_last_issue = entry.detail ?? null;
  await db.from("whatsapp_channels").update({ metadata: meta }).eq("id", entry.channelId);
  return true;
}

export async function reconcileWhatsAppChannels(db: SupabaseClient): Promise<{
  checked: number;
  entries: ChannelHealthEntry[];
  alerted: number;
}> {
  const { data: rows, error } = await db
    .from("whatsapp_channels")
    .select("id, organization_id, e164, status, provider, twilio_subaccount_sid, twilio_subaccount_auth_token, metadata")
    .or("provider.eq.twilio,provider.is.null")
    .in("status", ["active", "pending", "suspended"]);

  if (error) throw new Error(error.message);

  const orgIds = [...new Set((rows ?? []).map(r => r.organization_id).filter(Boolean))] as string[];
  const { data: orgs } = orgIds.length
    ? await db.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgName = new Map((orgs ?? []).map(o => [String(o.id), String(o.name)]));

  const entries: ChannelHealthEntry[] = [];
  for (const row of (rows ?? []) as ChannelRow[]) {
    let result: Omit<ChannelHealthEntry, "organizationName">;
    try {
      result = await checkChannel(db, row);
    } catch (err) {
      result = {
        channelId: row.id,
        organizationId: row.organization_id,
        e164: row.e164,
        action: "failed",
        detail: err instanceof Error ? err.message : "error desconocido"
      };
    }
    entries.push({ ...result, organizationName: row.organization_id ? orgName.get(row.organization_id) ?? null : null });
  }

  const toAlert: ChannelHealthEntry[] = [];
  for (const entry of entries) {
    if (entry.action !== "ok" && entry.action !== "skipped") {
      console.warn("[whatsapp/health]", entry.action, entry.organizationName, entry.e164, entry.detail);
    }
    if (await shouldAlert(db, entry)) toAlert.push(entry);
  }

  if (toAlert.length) {
    try {
      await notifyAdminsWhatsAppHealth(toAlert);
    } catch (err) {
      console.error("[whatsapp/health] no se pudo enviar la alerta", err);
    }
  }

  return { checked: entries.length, entries, alerted: toAlert.length };
}
