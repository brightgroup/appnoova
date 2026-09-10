import { NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  PaddleApiError,
  getPaddleInvoicePdfUrl,
  getPaddleTransaction,
} from "@/lib/billing/paddle/client";

const PDF_FETCH_MS = 20_000;

function paddleErrorMessage(err: unknown): { status: number; body: { error: string } } {
  const detail = err instanceof Error ? err.message : "error desconocido";
  const api = err instanceof PaddleApiError ? err : null;
  const notReady =
    api?.code === "transaction_invoice_not_ready" || /invoice_not_ready|not_ready/i.test(detail);

  if (notReady) {
    return {
      status: 409,
      body: { error: "Paddle aún está generando el PDF. Espera un minuto y reintenta." },
    };
  }
  if (api?.status === 404 || /404/.test(detail)) {
    return {
      status: 502,
      body: {
        error:
          "Paddle no tiene un PDF para este cobro. Abre el correo de confirmación de Paddle o el portal de cliente.",
      },
    };
  }
  if (detail.includes("PADDLE_API_KEY")) {
    return { status: 502, body: { error: "Falta la API key de Paddle en el servidor." } };
  }
  return { status: 502, body: { error: `No se pudo generar el PDF (${detail}).` } };
}

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

  const txnId = invoice.paddle_transaction_id as string;

  try {
    const txn = await getPaddleTransaction(txnId);
    if (txn.status !== "completed" && txn.status !== "billed") {
      return NextResponse.json(
        {
          error: `El cobro en Paddle está en estado «${txn.status}». El PDF sale cuando el pago queda completed.`,
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[billing:invoice-pdf] txn", txnId, err);
    const mapped = paddleErrorMessage(err);
    if (err instanceof PaddleApiError && err.status === 404) {
      return NextResponse.json(
        { error: "Noova no encontró esa transacción en Paddle. El PDF está en el correo de confirmación de Paddle." },
        { status: 502 }
      );
    }
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  let paddleUrl: string;
  try {
    paddleUrl = await getPaddleInvoicePdfUrl(txnId, "attachment");
  } catch (err) {
    console.error("[billing:invoice-pdf] url", txnId, err);
    const mapped = paddleErrorMessage(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
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
        "Content-Disposition": `attachment; filename="factura-${invoice.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[billing:invoice-pdf] proxy", txnId, err);
    return NextResponse.json({ url: paddleUrl });
  }
}
