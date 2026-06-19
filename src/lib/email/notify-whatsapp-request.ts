import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";

export interface WhatsAppRequestNotifyContext {
  request: {
    id: string;
    friendly_name: string | null;
    phone_e164: string | null;
    notes: string | null;
    created_at: string;
  };
  clientName: string | null;
  clientEmail: string | null;
  organizationName: string | null;
  agentName: string | null;
}

async function getAdminEmails(): Promise<string[]> {
  const fromEnv = process.env.NOOVA_ADMIN_EMAIL?.split(",").map(e => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;

  const db = adminClient();
  const { data } = await db.from("users").select("email").eq("rol", "admin");
  return (data ?? []).map(u => u.email).filter(Boolean) as string[];
}

function buildHtml(ctx: WhatsAppRequestNotifyContext): string {
  const { request, clientName, clientEmail, organizationName, agentName } = ctx;
  const adminUrl = `${getAppBaseUrl()}/admin/whatsapp?tab=requests`;
  const date = new Date(request.created_at).toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short"
  });

  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="color:#5b5bf6;margin:0 0 12px">Nueva solicitud de línea WhatsApp</h2>
      <p style="color:#444;margin:0 0 20px">Un cliente solicitó activación de WhatsApp Business.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#666">Organización</td><td style="padding:8px 0"><strong>${organizationName ?? "—"}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666">Cliente</td><td style="padding:8px 0"><strong>${clientName ?? "—"}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${clientEmail ?? "—"}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Línea</td><td style="padding:8px 0">${request.friendly_name ?? "WhatsApp"}</td></tr>
        ${request.phone_e164 ? `<tr><td style="padding:8px 0;color:#666">Número sugerido</td><td style="padding:8px 0;font-family:monospace">${request.phone_e164}</td></tr>` : ""}
        ${agentName ? `<tr><td style="padding:8px 0;color:#666">Agente IA</td><td style="padding:8px 0">${agentName}</td></tr>` : ""}
        ${request.notes ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Notas</td><td style="padding:8px 0">${request.notes}</td></tr>` : ""}
        <tr><td style="padding:8px 0;color:#666">Fecha</td><td style="padding:8px 0">${date}</td></tr>
      </table>
      <p style="margin:24px 0 0">
        <a href="${adminUrl}" style="display:inline-block;background:#5b5bf6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Revisar en admin
        </a>
      </p>
    </div>
  `.trim();
}

/** Envía email a admins. No lanza si falta configuración de email. */
export async function notifyAdminsWhatsAppRequest(ctx: WhatsAppRequestNotifyContext): Promise<SendEmailResult> {
  const admins = await getAdminEmails();
  if (!admins.length) {
    console.warn("[email:whatsapp-request] Sin destinatarios — configura NOOVA_ADMIN_EMAIL");
    return { sent: false, reason: "no_recipients" };
  }

  const clientLabel = ctx.clientName || ctx.clientEmail || ctx.organizationName || "Cliente";
  const subject = `Nueva solicitud WhatsApp — ${clientLabel}`;

  return sendEmail({
    to: admins,
    subject,
    html: buildHtml(ctx)
  });
}
