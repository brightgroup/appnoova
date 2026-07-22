import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import { getOrgInboxTeamUserIds } from "@/lib/push/team";
import { channelLabel } from "@/lib/email/notify-handoff";
import {
  NOTIFY_TEAM_EVENT_META,
  type NotifyTeamEvent
} from "@/lib/text-notify-rules";

export interface TeamEventNotifyContext {
  organizationId: string;
  conversationId: string;
  channel: string;
  event: NotifyTeamEvent;
  summary: string;
  whenLabel?: string | null;
  agentName?: string | null;
  contactLabel?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getOrgTeamEmails(organizationId: string): Promise<{
  emails: string[];
  organizationName: string | null;
}> {
  const db = adminClient();
  const [{ data: org }, userIds] = await Promise.all([
    db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    getOrgInboxTeamUserIds(organizationId)
  ]);

  if (!userIds.length) {
    return { emails: [], organizationName: org?.name ? String(org.name) : null };
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("email")
    .in("id", userIds);

  const emails = [
    ...new Set(
      (profiles ?? [])
        .map(p => String(p.email ?? "").trim().toLowerCase())
        .filter(e => e.includes("@"))
    )
  ];

  return { emails, organizationName: org?.name ? String(org.name) : null };
}

function buildHtml(ctx: TeamEventNotifyContext, organizationName: string | null): string {
  const hasConversation = Boolean(ctx.conversationId && ctx.conversationId !== "pending");
  const inboxUrl = hasConversation
    ? `${getAppBaseUrl()}/dashboard/inbox?id=${encodeURIComponent(ctx.conversationId)}`
    : `${getAppBaseUrl()}/dashboard/inbox`;
  const when = new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota"
  });
  const eventLabel = NOTIFY_TEAM_EVENT_META[ctx.event].label;
  const summary = escapeHtml(ctx.summary.trim().slice(0, 600));
  const whenLabel = ctx.whenLabel?.trim()
    ? escapeHtml(ctx.whenLabel.trim().slice(0, 120))
    : null;

  return `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
          <tr>
            <td style="background:#03289d;padding:22px 28px">
              <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0fe3ff;font-weight:600">Noova 360</p>
              <h1 style="margin:8px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">
                ${escapeHtml(eventLabel)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#334155;line-height:1.5">
                El agente IA detectó un evento importante en ${escapeHtml(organizationName || "tu organización")}.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
                <tr>
                  <td style="padding:16px 18px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">
                    <p style="margin:0 0 8px"><strong>Contacto:</strong> ${escapeHtml(ctx.contactLabel?.trim() || "Visitante")}</p>
                    <p style="margin:0 0 8px"><strong>Canal:</strong> ${escapeHtml(channelLabel(ctx.channel))}</p>
                    ${ctx.agentName ? `<p style="margin:0 0 8px"><strong>Agente:</strong> ${escapeHtml(ctx.agentName)}</p>` : ""}
                    ${whenLabel ? `<p style="margin:0 0 8px"><strong>Cuándo:</strong> ${whenLabel}</p>` : ""}
                    <p style="margin:0"><strong>Resumen:</strong> ${summary}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#94a3b8">${escapeHtml(when)}</p>
              <a href="${inboxUrl}" style="display:inline-block;margin-top:20px;background:#03289d;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">
                Abrir conversación
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function notifyOrgTeamEvent(ctx: TeamEventNotifyContext): Promise<SendEmailResult> {
  const { emails, organizationName } = await getOrgTeamEmails(ctx.organizationId);
  if (!emails.length) {
    console.warn("[email:team-event] Sin destinatarios", ctx.organizationId, ctx.event);
    return { sent: false, reason: "no_recipients" };
  }

  const contact = ctx.contactLabel?.trim() || "Visitante";
  const eventLabel = NOTIFY_TEAM_EVENT_META[ctx.event].label;
  const subject = `${eventLabel} — ${contact} (${channelLabel(ctx.channel)})`;

  return sendEmail({
    to: emails,
    subject,
    html: buildHtml(ctx, organizationName)
  });
}

export function buildTeamEventWhatsAppBody(ctx: TeamEventNotifyContext): string {
  const eventLabel = NOTIFY_TEAM_EVENT_META[ctx.event].label;
  const contact = ctx.contactLabel?.trim() || "Visitante";
  const when = ctx.whenLabel?.trim() ? `\n📅 ${ctx.whenLabel.trim()}` : "";
  return (
    `🔔 *${eventLabel}*\n` +
    `👤 ${contact}\n` +
    `💬 ${channelLabel(ctx.channel)}\n` +
    `${when ? `${when}\n` : ""}` +
    `\n${ctx.summary.trim().slice(0, 400)}`
  );
}
