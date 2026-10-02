import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import { detachTwilioWhatsAppSenderWebhook } from "@/lib/whatsapp/twilio-senders";
import { syncTwilioWhatsAppChannel } from "@/lib/whatsapp/twilio-channel-sync";

export interface WhatsAppBillingSuspendResult {
  organizationId: string;
  suspended: string[];
  twilioDetached: string[];
  errors: { channelId: string; error: string }[];
}

function priorMeta(channel: WhatsAppChannelRecord): Record<string, unknown> {
  return channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
    ? { ...(channel.metadata as Record<string, unknown>) }
    : {};
}

/** Suspende líneas WhatsApp activas de una org (facturación vencida / impago). */
export async function suspendOrgWhatsAppChannelsForBilling(
  db: SupabaseClient,
  organizationId: string
): Promise<WhatsAppBillingSuspendResult> {
  const result: WhatsAppBillingSuspendResult = {
    organizationId,
    suspended: [],
    twilioDetached: [],
    errors: []
  };

  const { data: rows, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error || !rows?.length) return result;

  const now = new Date().toISOString();

  for (const row of rows) {
    const channel = toWhatsAppChannelRecord(row as Record<string, unknown>);
    const meta = priorMeta(channel);

    const { error: updateErr } = await db
      .from("whatsapp_channels")
      .update({
        status: "suspended",
        meta_access_token: null,
        metadata: {
          ...meta,
          billing_suspended_at: now,
          billing_suspended_reason: "subscription_inactive",
          prior_status: channel.status
        },
        updated_at: now
      })
      .eq("id", channel.id);

    if (updateErr) {
      result.errors.push({ channelId: channel.id, error: updateErr.message });
      continue;
    }

    result.suspended.push(channel.id);

    let subSid = String(channel.twilio_subaccount_sid ?? "").trim();
    let subToken = String(channel.twilio_subaccount_auth_token ?? "").trim();

    if ((!subSid || !subToken) && organizationId) {
      const { data: org } = await db
        .from("organizations")
        .select("twilio_subaccount_sid, twilio_subaccount_auth_token")
        .eq("id", organizationId)
        .maybeSingle();
      subSid = subSid || String(org?.twilio_subaccount_sid ?? "").trim();
      subToken = subToken || String(org?.twilio_subaccount_auth_token ?? "").trim();
    }

    if (!subSid || !subToken) continue;

    try {
      await detachTwilioWhatsAppSenderWebhook({
        e164: channel.e164,
        accountSid: subSid,
        authToken: subToken
      });
      result.twilioDetached.push(channel.id);
    } catch (err) {
      result.errors.push({
        channelId: channel.id,
        error: err instanceof Error ? err.message : "No se pudo desvincular webhook Twilio"
      });
    }
  }

  return result;
}

/**
 * Tras pago: reactiva las líneas que se suspendieron por facturación.
 *
 * Antes solo las dejaba en "pending" esperando una reactivación manual que
 * nadie hacía: el webhook de Twilio seguía desconectado y los mensajes de los
 * clientes se perdían en silencio durante días (Mil hojaldres, 2026-09-29 →
 * 2026-10-02). Ahora, en líneas Twilio, re-vincula el webhook y las deja
 * "active" en el mismo paso; si Twilio falla quedan "pending" y el cron
 * /api/cron/whatsapp-health lo reintenta cada 15 minutos.
 */
export async function markOrgWhatsAppChannelsPendingReactivation(
  db: SupabaseClient,
  organizationId: string
): Promise<number> {
  const { data: rows } = await db
    .from("whatsapp_channels")
    .select("id, metadata")
    .eq("organization_id", organizationId)
    .eq("status", "suspended")
    .not("metadata->billing_suspended_at", "is", null);

  if (!rows?.length) return 0;

  const now = new Date().toISOString();
  let count = 0;

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    delete meta.billing_suspended_at;
    delete meta.billing_suspended_reason;
    meta.billing_reactivation_pending = now;

    const { error } = await db
      .from("whatsapp_channels")
      .update({
        status: "pending",
        metadata: meta,
        updated_at: now
      })
      .eq("id", row.id);

    if (error) continue;
    count += 1;

    try {
      await syncTwilioWhatsAppChannel(db, String(row.id));
    } catch (err) {
      console.error("[whatsapp/billing] no se pudo reactivar la línea tras el pago", row.id, err);
    }
  }

  return count;
}

/** Suspende WhatsApp de todas las organizaciones con cuenta suspendida. */
export async function suspendWhatsAppForSuspendedOrganizations(
  db: SupabaseClient
): Promise<WhatsAppBillingSuspendResult[]> {
  const { data: orgs } = await db
    .from("organizations")
    .select("id")
    .eq("status", "suspended");

  const results: WhatsAppBillingSuspendResult[] = [];
  for (const org of orgs ?? []) {
    const res = await suspendOrgWhatsAppChannelsForBilling(db, String(org.id));
    if (res.suspended.length || res.errors.length) {
      results.push(res);
    }
  }
  return results;
}
