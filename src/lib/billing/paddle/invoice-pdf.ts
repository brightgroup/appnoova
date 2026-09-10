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
    const paddleUrl = await getPaddleInvoicePdfUrl(invoice.paddle_transaction_id, "inline");
    const pdfRes = await fetch(paddleUrl);
    if (!pdfRes.ok || !pdfRes.body) {
      throw new Error(`Paddle PDF HTTP ${pdfRes.status}`);
    }
    return new NextResponse(pdfRes.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${invoice.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[billing:invoice-pdf]", invoice.paddle_transaction_id, err);
    const detail = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json(
      {
        error:
          detail.includes("PADDLE_API_KEY")
            ? "Falta la API key de Paddle en el servidor."
            : `No se pudo generar el PDF (${detail}). Si el pago es de hace minutos, reintenta.`,
      },
      { status: 502 }
    );
  }
}
