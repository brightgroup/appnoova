import { authFetch } from "@/lib/telephony-api";

export async function openInvoicePdf(invoiceId: string, asAdmin = false): Promise<void> {
  const path = asAdmin
    ? `/api/admin/billing/invoices/${invoiceId}/pdf`
    : `/api/billing/invoices/${invoiceId}/pdf`;
  const res = await authFetch(path);
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "No se pudo abrir la factura");
  }
  window.open(json.url, "_blank", "noopener,noreferrer");
}
