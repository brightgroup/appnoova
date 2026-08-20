import { companySizeLabel, planInterestLabel, type LandingLeadRecord } from "@/lib/landing-leads";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";

const DEFAULT_NOTIFY_EMAIL = "info@bgsoluciones.com.co";

function notifyRecipients(): string[] {
  const fromEnv = process.env.LANDING_LEAD_NOTIFY_EMAIL?.split(",").map(e => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  return [DEFAULT_NOTIFY_EMAIL];
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    hero_demo: "Hero — Probar demo",
    hero_features: "Hero — Ver cómo funciona",
    footer_cta: "Footer — Acceso gratis",
    footer_sales: "Footer — Contactar ventas",
    plan_explorador: "Plan Explorador",
    plan_esencial: "Plan Esencial",
    plan_crecimiento: "Plan Crecimiento",
    plan_escala: "Plan Escala",
    plan_corporativo: "Plan Corporativo"
  };
  return labels[source] ?? source;
}

function buildHtml(lead: LandingLeadRecord): string {
  const date = new Date(lead.created_at).toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short"
  });

  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
      <h2 style="color:#0f7eff;margin:0 0 12px">Nuevo lead — Noova 360</h2>
      <p style="color:#444;margin:0 0 20px">Solicitud desde la landing.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#666">Origen</td><td style="padding:8px 0"><strong>${sourceLabel(lead.source)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666">Plan / interés</td><td style="padding:8px 0">${planInterestLabel(lead.plan_interest)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Empresa</td><td style="padding:8px 0"><strong>${lead.company_name}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666">Contacto</td><td style="padding:8px 0">${lead.contact_name}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
        ${lead.phone ? `<tr><td style="padding:8px 0;color:#666">Teléfono</td><td style="padding:8px 0">${lead.phone}</td></tr>` : ""}
        <tr><td style="padding:8px 0;color:#666">Tamaño empresa</td><td style="padding:8px 0">${companySizeLabel(lead.company_size)}</td></tr>
        ${lead.message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top">Mensaje</td><td style="padding:8px 0">${lead.message}</td></tr>` : ""}
        <tr><td style="padding:8px 0;color:#666">Fecha</td><td style="padding:8px 0">${date}</td></tr>
      </table>
    </div>
  `.trim();
}

export async function notifyLandingLead(lead: LandingLeadRecord): Promise<SendEmailResult> {
  const recipients = notifyRecipients();
  const subject = `Nuevo lead Noova — ${lead.company_name} (${companySizeLabel(lead.company_size)})`;

  return sendEmail({
    to: recipients,
    subject,
    html: buildHtml(lead)
  });
}
