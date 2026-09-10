import { NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getPaddleInvoicePdfUrl } from "@/lib/billing/paddle/client";

export async function paddleInvoicePdfResponse(
  invoiceId: string,
  organizationId?: string
): Promise<NextResponse> {
  const db = adminClient();
  let q = db
    .from("billing_invoices")
    .select("id, organization_id, paddle_transaction_id, status")
    .eq("id", invoiceId);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: invoice } = await q.maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }
  if (!invoice.paddle_transaction_id) {
    return NextResponse.json(
      { error: "Esta factura es interna (cobro manual). No hay PDF de Paddle." },
      { status: 404 }
    );
  }
  if (invoice.status !== "paid") {
    return NextResponse.json({ error: "El PDF de Paddle solo está disponible en facturas pagadas." }, { status: 409 });
  }

  try {
    const url = await getPaddleInvoicePdfUrl(invoice.paddle_transaction_id, "inline");
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing:invoice-pdf]", invoice.paddle_transaction_id, err);
    return NextResponse.json(
      { error: "Paddle aún no tiene el PDF listo. Reintenta en unos minutos." },
      { status: 502 }
    );
  }
}
