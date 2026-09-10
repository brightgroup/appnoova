import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail } from "@/lib/email/send";
import { SUPERADMIN_EMAIL } from "@/lib/rbac-constants";

export interface PaddlePaymentNotifyContext {
  organizationId: string;
  organizationName: string;
  planId: string;
  amountUsd: number;
  paddleTransactionId: string;
  invoiceId?: string | null;
}

async function adminEmails(): Promise<string[]> {
  const fromEnv = process.env.NOOVA_ADMIN_EMAIL?.split(",").map((e) => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  return [SUPERADMIN_EMAIL];
}

async function orgBillingEmails(organizationId: string): Promise<string[]> {
  const db = adminClient();
  const { data: org } = await db
    .from("organizations")
    .select("owner_user_id")
    .eq("id", organizationId)
    .maybeSingle();
  const { data: members } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  const ids = [
    ...new Set(
      [org?.owner_user_id, ...(members ?? []).map((m) => m.user_id)].filter(Boolean) as string[]
    ),
  ];
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("email").in("id", ids);
  return [
    ...new Set(
      (profiles ?? [])
        .map((p) => String(p.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Avisa a la org y a Noova cuando un pago de Paddle queda registrado. */
export async function notifyPaddlePaymentRecorded(ctx: PaddlePaymentNotifyContext): Promise<void> {
  const when = new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
  const billingUrl = `${getAppBaseUrl()}/dashboard/facturacion`;
  const adminUrl = `${getAppBaseUrl()}/admin/billing/${ctx.organizationId}`;
  const orgName = escapeHtml(ctx.organizationName);
  const amount = ctx.amountUsd.toFixed(2);
  const txn = escapeHtml(ctx.paddleTransactionId);

  const clientHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">Pago confirmado — Noova 360</h2>
      <p style="color:#444">Recibimos tu pago de <strong>USD ${amount}</strong> para <strong>${orgName}</strong>.</p>
      <p style="color:#444">La factura/recibo oficial la emite Paddle (Merchant of Record). También la tienes en Facturación, botón Descargar.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <tr><td style="padding:6px 0;color:#666">Plan</td><td>${escapeHtml(ctx.planId)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Transacción</td><td style="font-family:monospace">${txn}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Fecha</td><td>${when}</td></tr>
      </table>
      <p><a href="${billingUrl}" style="display:inline-block;background:#0f7eff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ver factura</a></p>
    </div>
  `.trim();

  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">Pago Paddle recibido</h2>
      <p><strong>${orgName}</strong> pagó <strong>USD ${amount}</strong> (${escapeHtml(ctx.planId)}).</p>
      <p style="font-family:monospace;font-size:13px">${txn}</p>
      <p><a href="${adminUrl}">Abrir en admin</a> · <a href="${billingUrl}">Facturación del cliente</a></p>
    </div>
  `.trim();

  const [clients, admins] = await Promise.all([orgBillingEmails(ctx.organizationId), adminEmails()]);
  const adminSet = new Set(admins.map((e) => e.toLowerCase()));
  const clientOnly = clients.filter((e) => !adminSet.has(e));

  if (clientOnly.length) {
    await sendEmail({
      to: clientOnly,
      subject: `Factura de tu plan Noova 360 — USD ${amount}`,
      html: clientHtml,
    });
  }
  if (admins.length) {
    await sendEmail({
      to: admins,
      subject: `Pago Paddle — ${ctx.organizationName} — USD ${amount}`,
      html: adminHtml,
    });
  }
}
