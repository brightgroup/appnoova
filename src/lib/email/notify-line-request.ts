import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { countryLabel } from "@/lib/telephony/countries";
import type { PhoneLineRequestRecord } from "@/types/phone-line-request";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";

export interface LineRequestNotifyContext {
  request: PhoneLineRequestRecord;
  clientName: string | null;
  clientEmail: string | null;
  agentName: string | null;
}

async function getAdminEmails(): Promise<string[]> {
  const fromEnv = process.env.NOOVA_ADMIN_EMAIL?.split(",").map(e => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;

  const db = adminClient();
  const { data } = await db.from("users").select("email").eq("rol", "admin");
  return (data ?? []).map(u => u.email).filter(Boolean) as string[];
}

function requestTypeLabel(type: string): string {
  if (type === "verify_outbound") return "Verificar número (outbound)";
  return "Compra de línea Noova";
}

function buildHtml(ctx: LineRequestNotifyContext): string {
  const { request, clientName, clientEmail, agentName } = ctx;
  const adminUrl = `${getAppBaseUrl()}/admin/telephony?tab=solicitudes`;
  const date = new Date(request.created_at).toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short"
  });

  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="color:#0f7eff;margin:0 0 12px">Nueva solicitud de línea telefónica</h2>
      <p style="color:#444;margin:0 0 20px">Un cliente envió una solicitud que requiere revisión.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#666">Cliente</td><td style="padding:8px 0"><strong>${clientName ?? "—"}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${clientEmail ?? "—"}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Tipo</td><td style="padding:8px 0">${requestTypeLabel(request.request_type)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">País</td><td style="padding:8px 0">${request.country_code ? countryLabel(request.country_code) : "—"}</td></tr>
        ${request.phone_e164 ? `<tr><td style="padding:8px 0;color:#666">Número</td><td style="padding:8px 0;font-family:monospace">${request.phone_e164}</td></tr>` : ""}
        ${agentName ? `<tr><td style="padding:8px 0;color:#666">Agente</td><td style="padding:8px 0">${agentName}</td></tr>` : ""}
        ${request.notes ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Notas</td><td style="padding:8px 0">${request.notes}</td></tr>` : ""}
        <tr><td style="padding:8px 0;color:#666">Fecha</td><td style="padding:8px 0">${date}</td></tr>
      </table>
      <p style="margin:24px 0 0">
        <a href="${adminUrl}" style="display:inline-block;background:#0f7eff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Ver en panel admin
        </a>
      </p>
    </div>
  `.trim();
}

/** Envía email a admins vía Resend. No lanza error si falta configuración. */
export async function notifyAdminsLineRequest(ctx: LineRequestNotifyContext): Promise<SendEmailResult> {
  const admins = await getAdminEmails();
  if (!admins.length) {
    console.warn("[email:line-request] Sin destinatarios — configura NOOVA_ADMIN_EMAIL o usuarios admin");
    return { sent: false, reason: "no_recipients" };
  }

  const clientLabel = ctx.clientName || ctx.clientEmail || "Cliente";
  const subject = `Nueva solicitud de línea — ${clientLabel}`;

  return sendEmail({
    to: admins,
    subject,
    html: buildHtml(ctx)
  });
}
