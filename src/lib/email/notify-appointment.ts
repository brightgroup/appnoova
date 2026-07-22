import { sendEmail, type SendEmailResult } from "@/lib/email/send";

export interface AppointmentContactEmailInput {
  contactEmail: string;
  contactName: string;
  organizationName: string | null;
  whenLabel: string;
  reason: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(input: AppointmentContactEmailInput): string {
  const org = input.organizationName || "la empresa";
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
                Tu cita quedó confirmada
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#334155;line-height:1.5">
                Hola ${escapeHtml(input.contactName)}, tu cita con ${escapeHtml(org)} quedó agendada.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
                <tr>
                  <td style="padding:16px 18px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">
                    <p style="margin:0 0 8px"><strong>Cuándo:</strong> ${escapeHtml(input.whenLabel)}</p>
                    ${input.reason ? `<p style="margin:0"><strong>Motivo:</strong> ${escapeHtml(input.reason)}</p>` : ""}
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#94a3b8">
                Si necesitas cambiar el horario, responde a esta conversación.
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

/** Correo de confirmación de cita al contacto final (no es un "invite" de Google Calendar, va por nuestro propio SMTP). */
export async function notifyContactAppointment(
  input: AppointmentContactEmailInput
): Promise<SendEmailResult> {
  if (!input.contactEmail.includes("@")) {
    return { sent: false, reason: "invalid_email" };
  }

  return sendEmail({
    to: input.contactEmail,
    subject: `Cita confirmada${input.organizationName ? ` — ${input.organizationName}` : ""}`,
    html: buildHtml(input)
  });
}
