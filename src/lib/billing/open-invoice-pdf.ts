import { authFetch } from "@/lib/telephony-api";

export async function openInvoicePdf(invoiceId: string, asAdmin = false): Promise<void> {
  const path = asAdmin
    ? `/api/admin/billing/invoices/${invoiceId}/pdf`
    : `/api/billing/invoices/${invoiceId}/pdf`;
  const res = await authFetch(path);
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `No se pudo abrir la factura (${res.status})`);
  }

  if (contentType.includes("application/pdf")) {
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `factura-noova-${invoiceId.slice(0, 8)}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
    return;
  }

  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!json.url) {
    throw new Error(json.error || "No se pudo abrir la factura");
  }
  window.location.assign(json.url);
}
