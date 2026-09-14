import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail } from "@/lib/email/send";
import { billingAdminEmails, orgBillingEmails, splitClientOnlyEmails } from "@/lib/email/billing-recipients";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function whenNow(): string {
  return new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
}

/**
 * Aviso proactivo cuando una factura queda vencida pero la cuenta NO se
 * suspende todavía (orgs protegidas, o Paddle que aún tiene `grace_days` de
 * margen antes de suspender). Para manual/Bold sin protección, vencida y
 * suspendida ocurren en el mismo paso del cron — en ese caso se envía
 * directamente `notifyAccountSuspended`, no este aviso.
 */
export async function notifyInvoicePastDue(params: {
  organizationId: string;
  organizationName: string;
  amountUsd: number | null;
  dueDate: string | Date;
}): Promise<void> {
  const orgName = escapeHtml(params.organizationName);
  const billingUrl = `${getAppBaseUrl()}/dashboard/facturacion`;
  const due = new Date(params.dueDate).toLocaleDateString("es-CO", {
    dateStyle: "long",
    timeZone: "America/Bogota",
  });
  const amount = params.amountUsd != null ? `US$${params.amountUsd.toFixed(2)}` : "tu factura pendiente";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px;color:#b45309">Tu factura está vencida — Noova 360</h2>
      <p style="color:#444">La factura de <strong>${orgName}</strong> por <strong>${amount}</strong> venció el <strong>${due}</strong> y sigue sin pagarse. Para evitar la suspensión del servicio, ponla al día cuanto antes.</p>
      <p><a href="${billingUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Pagar ahora</a></p>
    </div>
  `.trim();

  const clients = await orgBillingEmails(params.organizationId);
  if (clients.length) {
    await sendEmail({ to: clients, subject: `Factura vencida — ${params.organizationName}`, html });
  }
}

/** Aviso cuando la cuenta queda suspendida por falta de pago (o trial vencido sin plan). */
export async function notifyAccountSuspended(params: {
  organizationId: string;
  organizationName: string;
  reason: "unpaid_invoice" | "trial_expired";
}): Promise<void> {
  const orgName = escapeHtml(params.organizationName);
  const billingUrl = `${getAppBaseUrl()}/dashboard/facturacion`;
  const adminUrl = `${getAppBaseUrl()}/admin/billing/${params.organizationId}`;
  const when = whenNow();
  const motivo =
    params.reason === "trial_expired"
      ? "tu periodo de prueba gratuito terminó sin un plan de pago activo"
      : "no se registró el pago de tu factura a tiempo";

  const clientHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px;color:#b91c1c">Tu cuenta fue suspendida — Noova 360</h2>
      <p style="color:#444">Suspendimos temporalmente el acceso de <strong>${orgName}</strong> porque ${motivo}.</p>
      <p style="color:#444">Apenas se registre el pago, la plataforma se reactiva <strong>automáticamente</strong> — no necesitas avisarnos ni esperar a que alguien lo revise.</p>
      <p><a href="${billingUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Reactivar mi cuenta</a></p>
      <p style="color:#888;font-size:13px">${when}</p>
    </div>
  `.trim();

  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">Cuenta suspendida por facturación</h2>
      <p><strong>${orgName}</strong> quedó suspendida — motivo: ${motivo}.</p>
      <p><a href="${adminUrl}">Abrir en admin</a> · <a href="${billingUrl}">Facturación del cliente</a></p>
    </div>
  `.trim();

  const [clients, admins] = await Promise.all([orgBillingEmails(params.organizationId), billingAdminEmails()]);
  const clientOnly = splitClientOnlyEmails(clients, admins);

  if (clientOnly.length) {
    await sendEmail({ to: clientOnly, subject: `Cuenta suspendida — ${params.organizationName}`, html: clientHtml });
  }
  if (admins.length) {
    await sendEmail({ to: admins, subject: `Suspendida por facturación — ${params.organizationName}`, html: adminHtml });
  }
}

/**
 * Aviso cuando un intento de pago con Bold es rechazado (`SALE_REJECTED`).
 * Bold NO manda correo automático en este caso (solo lo hace para pagos
 * aprobados), así que esto es lo único que se entera el cliente sin volver
 * a mirar el dashboard.
 */
export async function notifyBoldPaymentRejected(params: {
  organizationId: string;
  organizationName: string;
  kind: "plan" | "topup";
  amountUsd: number | null;
}): Promise<void> {
  const orgName = escapeHtml(params.organizationName);
  const billingUrl = `${getAppBaseUrl()}/dashboard/facturacion`;
  const concept = params.kind === "topup" ? "la recarga de créditos" : "el pago de tu plan";
  const amount = params.amountUsd != null ? ` (US$${params.amountUsd.toFixed(2)})` : "";

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px;color:#b45309">No pudimos procesar tu pago — Noova 360</h2>
      <p style="color:#444">Tu banco o Bold rechazó ${concept}${amount} para <strong>${orgName}</strong>. Puede ser fondos insuficientes, datos de la tarjeta o un bloqueo del banco por seguridad.</p>
      <p><a href="${billingUrl}" style="display:inline-block;background:#0f7eff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Intentar de nuevo</a></p>
    </div>
  `.trim();

  const clients = await orgBillingEmails(params.organizationId);
  if (clients.length) {
    await sendEmail({ to: clients, subject: `Pago rechazado — ${params.organizationName}`, html });
  }
}

/**
 * Revisa qué organizaciones cambiaron de estado en la última pasada del cron
 * de facturación (`billing_run_renewals`, llamado justo antes con timestamp
 * `sinceIso`) y dispara el correo correspondiente — suspendida o vencida
 * pero aún no bloqueada (orgs protegidas). Usa `updated_at >= sinceIso` para
 * detectar solo las transiciones de esta corrida, no organizaciones que ya
 * estaban en ese estado de antes.
 */
export async function notifyNewBillingTransitions(
  db: SupabaseClient,
  sinceIso: string
): Promise<{ suspended: number; pastDue: number }> {
  let suspended = 0;
  let pastDue = 0;

  const { data: suspendedSubs } = await db
    .from("organization_subscriptions")
    .select("organization_id, trial_ends_at, price_usd, organizations(name)")
    .eq("status", "suspended")
    .gte("updated_at", sinceIso);

  for (const row of suspendedSubs ?? []) {
    const org = (row as { organizations?: { name?: string | null } }).organizations;
    const isTrialExpired =
      row.trial_ends_at != null && new Date(row.trial_ends_at) <= new Date() && Number(row.price_usd ?? 0) <= 0;
    try {
      await notifyAccountSuspended({
        organizationId: row.organization_id,
        organizationName: org?.name ?? "Organización",
        reason: isTrialExpired ? "trial_expired" : "unpaid_invoice",
      });
      suspended++;
    } catch (err) {
      console.error("[billing-cron] no se pudo notificar suspensión", row.organization_id, err);
    }
  }

  const { data: pastDueSubs } = await db
    .from("organization_subscriptions")
    .select("organization_id, organizations(name)")
    .eq("status", "past_due")
    .gte("updated_at", sinceIso);

  for (const row of pastDueSubs ?? []) {
    const org = (row as { organizations?: { name?: string | null } }).organizations;
    const { data: invoice } = await db
      .from("billing_invoices")
      .select("amount_usd, due_date")
      .eq("organization_id", row.organization_id)
      .eq("status", "overdue")
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    try {
      await notifyInvoicePastDue({
        organizationId: row.organization_id,
        organizationName: org?.name ?? "Organización",
        amountUsd: invoice?.amount_usd ?? null,
        dueDate: invoice?.due_date ?? new Date(),
      });
      pastDue++;
    } catch (err) {
      console.error("[billing-cron] no se pudo notificar mora", row.organization_id, err);
    }
  }

  return { suspended, pastDue };
}
