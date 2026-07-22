import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import { getOrgConectoresTeamUserIds } from "@/lib/push/team";

async function getOrgConectoresEmails(organizationId: string): Promise<string[]> {
  const db = adminClient();
  const userIds = await getOrgConectoresTeamUserIds(organizationId);
  if (!userIds.length) return [];

  const { data: profiles } = await db.from("profiles").select("email").in("id", userIds);

  return [
    ...new Set(
      (profiles ?? [])
        .map(p => String(p.email ?? "").trim().toLowerCase())
        .filter(e => e.includes("@"))
    )
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Avisa a quienes pueden administrar Conectores (módulo "conectores" ≥ edit)
 * que la conexión de Google Calendar dejó de funcionar — típico mientras el
 * conector está en modo Prueba de Google (el token vence cada 7 días).
 * Se dispara solo en la transición activa → error, nunca en cada intento
 * fallido repetido (ver `markCalendarConnectionError`).
 */
export async function notifyCalendarConnectionBroken(
  organizationId: string,
  reason: string
): Promise<SendEmailResult> {
  const emails = await getOrgConectoresEmails(organizationId);
  if (!emails.length) {
    console.warn("[email:calendar-disconnected] Sin destinatarios en la organización", organizationId);
    return { sent: false, reason: "no_recipients" };
  }

  const reconnectUrl = `${getAppBaseUrl()}/dashboard/conectores/google-calendar`;

  const html = `
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
                Tu Google Calendar se desconectó
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.55;color:#334155">
                Tus agentes de IA no podrán agendar ni consultar disponibilidad hasta que reconectes el calendario.
                Esto suele pasar mientras el conector está en modo de prueba de Google (el acceso vence cada 7 días).
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
                <tr>
                  <td style="padding:14px 16px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#64748b">
                    ${escapeHtml(reason.slice(0, 300))}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0">
                <a href="${reconnectUrl}" style="display:inline-block;background:#006e80;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600">
                  Reconectar Google Calendar
                </a>
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

  return sendEmail({
    to: emails,
    subject: "Tu Google Calendar se desconectó — reconéctalo",
    html
  });
}
