import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail } from "@/lib/email/send";
import { billingAdminEmails, orgBillingEmails, splitClientOnlyEmails } from "@/lib/email/billing-recipients";

export interface BoldPaymentNotifyContext {
  organizationId: string;
  organizationName: string;
  kind: "plan" | "topup" | "invoice";
  planId?: string | null;
  /** Lo que se le cobró al cliente en su tarjeta (moneda multidivisa de Bold). */
  amountUsd: number;
  /** Equivalente/liquidación en pesos que recibe el comercio (referencial). */
  amountCop: number;
  boldPaymentId: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function fmtCop(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** Avisa a la org y a Noova cuando un pago de Bold queda registrado. */
export async function notifyBoldPaymentRecorded(ctx: BoldPaymentNotifyContext): Promise<void> {
  const when = new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
  const billingUrl = `${getAppBaseUrl()}/dashboard/facturacion`;
  const adminUrl = `${getAppBaseUrl()}/admin/billing/${ctx.organizationId}`;
  const orgName = escapeHtml(ctx.organizationName);
  const usd = fmtUsd(ctx.amountUsd);
  const cop = fmtCop(ctx.amountCop);
  const txn = escapeHtml(ctx.boldPaymentId);
  const concept = ctx.kind === "topup" ? "recarga de créditos" : ctx.kind === "invoice" ? "pago de factura" : `plan ${escapeHtml(ctx.planId ?? "")}`;

  const clientHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">Pago confirmado — Noova 360</h2>
      <p style="color:#444">Recibimos tu pago de <strong>US$${usd}</strong> (${concept}) para <strong>${orgName}</strong>, procesado por Bold.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <tr><td style="padding:6px 0;color:#666">Transacción Bold</td><td style="font-family:monospace">${txn}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Fecha</td><td>${when}</td></tr>
      </table>
      <p><a href="${billingUrl}" style="display:inline-block;background:#0f7eff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ver factura</a></p>
    </div>
  `.trim();

  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">Pago Bold recibido</h2>
      <p><strong>${orgName}</strong> pagó <strong>US$${usd}</strong> (${concept}) — equivalente aprox. <strong>$${cop} COP</strong> liquidados por Bold.</p>
      <p style="font-family:monospace;font-size:13px">${txn}</p>
      <p><a href="${adminUrl}">Abrir en admin</a> · <a href="${billingUrl}">Facturación del cliente</a></p>
    </div>
  `.trim();

  const [clients, admins] = await Promise.all([orgBillingEmails(ctx.organizationId), billingAdminEmails()]);
  const clientOnly = splitClientOnlyEmails(clients, admins);

  if (clientOnly.length) {
    await sendEmail({
      to: clientOnly,
      subject: `Factura de tu plan Noova 360 — US$${usd}`,
      html: clientHtml,
    });
  }
  if (admins.length) {
    await sendEmail({
      to: admins,
      subject: `Pago Bold — ${ctx.organizationName} — US$${usd}`,
      html: adminHtml,
    });
  }
}
