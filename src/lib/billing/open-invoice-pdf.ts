import { authFetch } from "@/lib/telephony-api";

export async function openInvoicePdf(
  invoiceId: string,
  asAdmin = false,
  disposition: "inline" | "attachment" = "attachment"
): Promise<void> {
  const path = asAdmin
    ? `/api/admin/billing/invoices/${invoiceId}/pdf?disposition=${disposition}`
    : `/api/billing/invoices/${invoiceId}/pdf?disposition=${disposition}`;

  const tab = window.open("about:blank", "_blank", "noopener");

  const res = await authFetch(path);
  const raw = await res.text();
  let json: { error?: string; url?: string } = {};
  try {
    json = JSON.parse(raw) as { error?: string; url?: string };
  } catch {
    json = {};
  }

  if (!res.ok || !json.url) {
    tab?.close();
    throw new Error(json.error || `No se pudo abrir la factura (${res.status})`);
  }

  if (tab) tab.location.replace(json.url);
  else window.location.assign(json.url);
}
