import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyPushForOrg } from "@/lib/push/send";
import {
  buildTeamEventWhatsAppBody,
  notifyOrgTeamEvent
} from "@/lib/email/notify-team-event";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-transport";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import {
  isNotifyTeamEvent,
  normalizeNotifyTeamRules,
  NOTIFY_TEAM_EVENT_META,
  type NotifyTeamEvent,
  type NotifyTeamRules
} from "@/lib/text-notify-rules";

export interface NotifyTeamToolArgs {
  event: string;
  summary: string;
  when_label?: string;
}

export interface NotifyTeamToolContext {
  db: SupabaseClient;
  organizationId: string;
  conversationId: string | null;
  channel: string;
  agentName?: string | null;
  contactLabel?: string | null;
  notifyRules: NotifyTeamRules;
  /** Canal WhatsApp de la org para avisar al equipo (opcional). */
  outboundWhatsAppChannel?: WhatsAppChannelRecord | null;
}

export interface NotifyTeamToolResult {
  ok: boolean;
  event?: NotifyTeamEvent;
  skipped?: boolean;
  reason?: string;
  email_sent?: boolean;
  push_sent?: boolean;
  whatsapp_sent?: number;
  whatsapp_failed?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function alreadyNotified(
  db: SupabaseClient,
  conversationId: string,
  event: NotifyTeamEvent
): Promise<boolean> {
  const { data } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();
  const meta = asRecord(data?.metadata);
  const stamp = asRecord(meta.team_notify_events)[event];
  return typeof stamp === "string" && stamp.length > 0;
}

async function stampNotified(
  db: SupabaseClient,
  conversationId: string,
  event: NotifyTeamEvent
): Promise<void> {
  const { data } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();
  const meta = asRecord(data?.metadata);
  const events = asRecord(meta.team_notify_events);
  events[event] = new Date().toISOString();
  await db
    .from("text_agent_conversations")
    .update({
      metadata: { ...meta, team_notify_events: events },
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId);
}

/** Ejecuta notify_team según reglas del agente. */
export async function executeNotifyTeamTool(
  args: NotifyTeamToolArgs,
  ctx: NotifyTeamToolContext
): Promise<NotifyTeamToolResult> {
  if (!isNotifyTeamEvent(args.event)) {
    return {
      ok: false,
      reason: `event inválido. Usa: appointment_booked | purchase_intent`
    };
  }

  const event = args.event;
  const rules = normalizeNotifyTeamRules(ctx.notifyRules);
  const rule = rules[event];
  if (!rule?.enabled) {
    return {
      ok: true,
      skipped: true,
      event,
      reason: `El evento ${event} no está activo en la configuración del agente`
    };
  }

  const summary = String(args.summary ?? "").trim();
  if (!summary) {
    return { ok: false, event, reason: "summary requerido" };
  }

  if (!ctx.conversationId) {
    // Aún sin fila de conversación: notificamos igual (email/push/WA) sin dedup.
  } else if (await alreadyNotified(ctx.db, ctx.conversationId, event)) {
    return {
      ok: true,
      skipped: true,
      event,
      reason: "Este evento ya se notificó en esta conversación"
    };
  }

  const conversationId = ctx.conversationId || "pending";
  const notifyCtx = {
    organizationId: ctx.organizationId,
    conversationId,
    channel: ctx.channel,
    event,
    summary,
    whenLabel: args.when_label?.trim() || null,
    agentName: ctx.agentName,
    contactLabel: ctx.contactLabel
  };

  let emailSent = false;
  if (rule.email) {
    const emailResult = await notifyOrgTeamEvent(notifyCtx);
    emailSent = emailResult.sent;
  }

  let pushSent = false;
  if (rule.push && ctx.conversationId) {
    void notifyPushForOrg(ctx.organizationId, {
      title: NOTIFY_TEAM_EVENT_META[event].label,
      body: `${ctx.contactLabel?.trim() || "Visitante"}: ${summary.slice(0, 120)}`,
      url: `/m/chats/${ctx.conversationId}`,
      tag: `team-event-${event}-${ctx.conversationId}`
    }).catch(err => console.warn("[notify_team] push:", err));
    pushSent = true;
  }

  let whatsappSent = 0;
  let whatsappFailed = 0;
  if (rule.whatsapp && rule.whatsapp_destinations.length && ctx.outboundWhatsAppChannel) {
    const body = buildTeamEventWhatsAppBody(notifyCtx);
    for (const toE164 of rule.whatsapp_destinations) {
      try {
        await sendWhatsAppTextMessage({
          db: ctx.db,
          channel: ctx.outboundWhatsAppChannel,
          toE164,
          body
        });
        whatsappSent += 1;
      } catch (err) {
        whatsappFailed += 1;
        console.warn(
          "[notify_team] whatsapp to",
          toE164,
          err instanceof Error ? err.message : err
        );
      }
    }
  } else if (rule.whatsapp && rule.whatsapp_destinations.length && !ctx.outboundWhatsAppChannel) {
    console.warn("[notify_team] WhatsApp activo pero la org no tiene canal activo");
  }

  if (ctx.conversationId) {
    await stampNotified(ctx.db, ctx.conversationId, event);
  }

  return {
    ok: true,
    event,
    email_sent: emailSent,
    push_sent: pushSent,
    whatsapp_sent: whatsappSent,
    whatsapp_failed: whatsappFailed
  };
}

export async function resolveOrgActiveWhatsAppChannel(
  db: SupabaseClient,
  organizationId: string
): Promise<WhatsAppChannelRecord | null> {
  const { data } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as WhatsAppChannelRecord | null) ?? null;
}
