import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import { getOrgInboxTeamUserIds } from "@/lib/push/team";

export interface HandoffNotifyContext {
  organizationId: string;
  conversationId: string;
  channel: string;
  agentName?: string | null;
  contactLabel?: string | null;
  visitorMessage?: string | null;
  reason: "user_request" | "ai_escalation";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    web_embed: "Widget web",
    web_widget: "Mi Link",
    web_test: "Prueba web"
  };
  return map[channel] || channel || "Chat";
}

function reasonLabel(reason: HandoffNotifyContext["reason"]): string {
  return reason === "user_request"
    ? "El cliente pidió hablar con un asesor"
    : "El agente IA escaló la conversación";
}

async function getOrgTeamEmails(organizationId: string): Promise<{
  emails: string[];
  organizationName: string | null;
}> {
  const db = adminClient();
  // Solo quienes pueden ver/usar el inbox (roles con módulo inbox ≥ view).
  // No es el usuario “con sesión”: en WhatsApp/widget no hay sesión de asesor.
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

function buildHtml(ctx: HandoffNotifyContext, organizationName: string | null): string {
  const inboxUrl = `${getAppBaseUrl()}/dashboard/inbox?id=${encodeURIComponent(ctx.conversationId)}`;
  const when = new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota"
  });
  const preview = ctx.visitorMessage?.trim()
    ? escapeHtml(
        ctx.visitorMessage.trim().length > 280
          ? `${ctx.visitorMessage.trim().slice(0, 280)}…`
          : ctx.visitorMessage.trim()
      )
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
                Conversación en espera de asesor
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 18px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.55;color:#334155">
                ${escapeHtml(reasonLabel(ctx.reason))}. La IA dejó de responder; un miembro del equipo puede tomarla en el inbox.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#0f172a">
                <tr>
                  <td style="padding:10px 0;color:#64748b;width:140px;vertical-align:top">Organización</td>
                  <td style="padding:10px 0;font-weight:600">${escapeHtml(organizationName ?? "—")}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9;color:#64748b;vertical-align:top">Canal</td>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9;font-weight:600">${escapeHtml(channelLabel(ctx.channel))}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9;color:#64748b;vertical-align:top">Contacto</td>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9">${escapeHtml(ctx.contactLabel ?? "Visitante")}</td>
                </tr>
                ${
                  ctx.agentName
                    ? `<tr>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9;color:#64748b;vertical-align:top">Agente IA</td>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9">${escapeHtml(ctx.agentName)}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9;color:#64748b;vertical-align:top">Fecha</td>
                  <td style="padding:10px 0;border-top:1px solid #f1f5f9">${escapeHtml(when)}</td>
                </tr>
              </table>
              ${
                preview
                  ? `<div style="margin:22px 0 0;padding:14px 16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
                <p style="margin:0 0 6px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#64748b">Último mensaje</p>
                <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:#1e293b">${preview}</p>
              </div>`
                  : ""
              }
              <p style="margin:28px 0 0">
                <a href="${inboxUrl}" style="display:inline-block;background:#006e80;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600">
                  Abrir en el inbox
                </a>
              </p>
              <p style="margin:16px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#94a3b8">
                Sin asignación automática: elige la conversación y asígnatela para responder.
              </p>
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

/** Notifica al equipo de la organización. No lanza si falta email. */
export async function notifyOrgHandoff(ctx: HandoffNotifyContext): Promise<SendEmailResult> {
  const { emails, organizationName } = await getOrgTeamEmails(ctx.organizationId);
  if (!emails.length) {
    console.warn("[email:handoff] Sin destinatarios en la organización", ctx.organizationId);
    return { sent: false, reason: "no_recipients" };
  }

  const contact = ctx.contactLabel?.trim() || "Visitante";
  const subject = `Asesor solicitado — ${contact} (${channelLabel(ctx.channel)})`;

  return sendEmail({
    to: emails,
    subject,
    html: buildHtml(ctx, organizationName)
  });
}

export function buildHandoffWhatsAppBody(ctx: HandoffNotifyContext): string {
  const contact = ctx.contactLabel?.trim() || "Visitante";
  const preview = ctx.visitorMessage?.trim()
    ? `\n\n${ctx.visitorMessage.trim().slice(0, 300)}`
    : "";
  return (
    `🔔 *Conversación en espera de asesor*\n` +
    `👤 ${contact}\n` +
    `💬 ${channelLabel(ctx.channel)}\n` +
    `📌 ${reasonLabel(ctx.reason)}` +
    `${preview}`
  );
}
