import { NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getPaddleInvoicePdfUrl } from "@/lib/billing/paddle/client";

const PDF_FETCH_MS = 20_000;

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

  let paddleUrl: string;
  try {
    paddleUrl = await getPaddleInvoicePdfUrl(invoice.paddle_transaction_id, "inline");
  } catch (err) {
    console.error("[billing:invoice-pdf] url", invoice.paddle_transaction_id, err);
    const detail = err instanceof Error ? err.message : "error desconocido";
    const notReady = /404/.test(detail);
    return NextResponse.json(
      {
        error: notReady
          ? "Paddle aún está generando el PDF. Espera un minuto y reintenta."
          : detail.includes("PADDLE_API_KEY")
            ? "Falta la API key de Paddle en el servidor."
            : `No se pudo generar el PDF (${detail}).`,
      },
      { status: notReady ? 409 : 502 }
    );
  }

  try {
    const pdfRes = await fetch(paddleUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(PDF_FETCH_MS),
    });
    if (!pdfRes.ok) {
      throw new Error(`Paddle PDF HTTP ${pdfRes.status}`);
    }
    const bytes = await pdfRes.arrayBuffer();
    if (bytes.byteLength < 80) {
      throw new Error("PDF vacío");
    }
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${invoice.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[billing:invoice-pdf] proxy", invoice.paddle_transaction_id, err);
    // El VPS a veces no puede bajar el PDF de Paddle; el enlace firmado sí abre en el navegador.
    return NextResponse.json({ url: paddleUrl });
  }
}
