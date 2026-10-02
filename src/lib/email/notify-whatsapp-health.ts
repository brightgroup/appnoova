import { adminClient } from "@/lib/voice-agents-server";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import type { ChannelHealthEntry } from "@/lib/whatsapp/channel-health";

async function getAdminEmails(): Promise<string[]> {
  const fromEnv = process.env.NOOVA_ADMIN_EMAIL?.split(",").map(e => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;

  const db = adminClient();
  const { data } = await db.from("users").select("email").eq("rol", "admin");
  return (data ?? []).map(u => u.email).filter(Boolean) as string[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ACTION_LABEL: Record<string, string> = {
  reactivated: "Reactivada automáticamente",
  webhook_repaired: "Webhook re-vinculado",
  failed: "FALLA — requiere revisión"
};

/** Avisa a los admins de Noova de líneas WhatsApp reparadas o caídas. */
export async function notifyAdminsWhatsAppHealth(entries: ChannelHealthEntry[]): Promise<SendEmailResult> {
  const to = await getAdminEmails();
  if (!to.length) {
    console.warn("[email:whatsapp-health] Sin destinatarios — configura NOOVA_ADMIN_EMAIL");
    return { sent: false, reason: "no_recipients" };
  }

  const failures = entries.filter(e => e.action === "failed").length;
  const subject = failures
    ? `⚠️ WhatsApp: ${failures} línea(s) sin recibir mensajes`
    : `WhatsApp: ${entries.length} línea(s) reparadas automáticamente`;

  const rows = entries
    .map(
      e => `<tr>
        <td style="padding:8px;border-top:1px solid #eee">${escapeHtml(e.organizationName ?? "—")}</td>
        <td style="padding:8px;border-top:1px solid #eee;font-family:monospace">${escapeHtml(e.e164)}</td>
        <td style="padding:8px;border-top:1px solid #eee;color:${e.action === "failed" ? "#c00" : "#0a7"}"><strong>${ACTION_LABEL[e.action] ?? e.action}</strong></td>
        <td style="padding:8px;border-top:1px solid #eee;color:#555">${escapeHtml(e.detail ?? "")}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:680px;color:#111">
      <h2 style="margin:0 0 12px">Chequeo de líneas WhatsApp</h2>
      <p style="color:#444;margin:0 0 16px">
        Una línea con el webhook de Twilio desconectado no entrega mensajes a Noova: el agente IA no responde
        y nada llega al inbox. Esto es lo que encontró el chequeo automático:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="text-align:left;color:#666"><th style="padding:8px">Cliente</th><th style="padding:8px">Número</th><th style="padding:8px">Resultado</th><th style="padding:8px">Detalle</th></tr>
        ${rows}
      </table>
    </div>
  `.trim();

  return sendEmail({ to, subject, html });
}
