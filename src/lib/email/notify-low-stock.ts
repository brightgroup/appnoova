import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { sendEmail, type SendEmailResult } from "@/lib/email/send";
import { getOrgErpTeamUserIds } from "@/lib/push/team";

export interface LowStockItem {
  id: string;
  codigo: string;
  nombre: string;
  existencia: number;
  stockMinimo: number;
}

export interface LowStockNotifyContext {
  organizationId: string;
  /** Uno solo para la alerta "al cruzar"; varios para el resumen diario. */
  items: LowStockItem[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** destinatarios explícitos de la regla, o el equipo con permiso erp >= manage si la regla los dejó vacíos. */
async function resolveRecipientEmails(
  db: ReturnType<typeof adminClient>,
  organizationId: string,
  explicitDestinatarios: string[]
): Promise<string[]> {
  const explicit = explicitDestinatarios.map(e => e.trim().toLowerCase()).filter(e => e.includes("@"));
  if (explicit.length) return [...new Set(explicit)];

  const userIds = await getOrgErpTeamUserIds(organizationId);
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

function buildHtml(items: LowStockItem[], organizationName: string | null): string {
  const inventoryUrl = `${getAppBaseUrl()}/dashboard/erp/inventario`;
  const when = new Date().toLocaleString("es-CO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota"
  });
  const title = items.length === 1
    ? "Producto en stock mínimo"
    : `${items.length} productos en stock mínimo o por debajo`;

  const rows = items
    .map(
      item => `
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-family:ui-monospace,monospace;font-size:13px;color:#334155">${escapeHtml(item.codigo)}</td>
          <td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#0f172a">${escapeHtml(item.nombre)}</td>
          <td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#334155;text-align:right">${item.existencia}</td>
          <td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#334155;text-align:right">${item.stockMinimo}</td>
        </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
          <tr>
            <td style="background:#03289d;padding:22px 28px">
              <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0fe3ff;font-weight:600">Noova 360 · ERP</p>
              <h1 style="margin:8px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">
                ${escapeHtml(title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 16px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#334155;line-height:1.5">
                En ${escapeHtml(organizationName || "tu organización")}, el inventario quedó en su mínimo o por debajo para lo siguiente:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
                <thead>
                  <tr>
                    <th style="padding:10px 12px;text-align:left;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8">Código</th>
                    <th style="padding:10px 12px;text-align:left;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8">Producto</th>
                    <th style="padding:10px 12px;text-align:right;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8">Existencia</th>
                    <th style="padding:10px 12px;text-align:right;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8">Mínimo</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <p style="margin:18px 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#94a3b8">${escapeHtml(when)}</p>
              <a href="${inventoryUrl}" style="display:inline-block;margin-top:20px;background:#03289d;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">
                Ver inventario
              </a>
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

/** Envía el correo de stock mínimo. No lanza error si falta configuración o no hay destinatarios. */
export async function notifyLowStock(ctx: LowStockNotifyContext): Promise<SendEmailResult> {
  if (!ctx.items.length) return { sent: false, reason: "no_items" };

  const db = adminClient();
  const [{ data: org }, { data: rule }] = await Promise.all([
    db.from("organizations").select("name").eq("id", ctx.organizationId).maybeSingle(),
    db
      .from("erp_inventory_alert_rules")
      .select("destinatarios")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle()
  ]);

  const emails = await resolveRecipientEmails(db, ctx.organizationId, rule?.destinatarios ?? []);
  if (!emails.length) {
    console.warn("[email:low-stock] Sin destinatarios", ctx.organizationId);
    return { sent: false, reason: "no_recipients" };
  }

  const organizationName = org?.name ? String(org.name) : null;
  const subject = ctx.items.length === 1
    ? `Stock mínimo — ${ctx.items[0].nombre}`
    : `${ctx.items.length} productos en stock mínimo`;

  return sendEmail({
    to: emails,
    subject,
    html: buildHtml(ctx.items, organizationName)
  });
}
