import { NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  PaddleApiError,
  getPaddleInvoicePdfUrl,
  getPaddleMode,
} from "@/lib/billing/paddle/client";

function paddleErrorMessage(err: unknown): { status: number; body: { error: string } } {
  const detail = err instanceof Error ? err.message : "error desconocido";
  const api = err instanceof PaddleApiError ? err : null;
  const notReady =
    api?.code === "transaction_invoice_not_ready" || /invoice_not_ready|not_ready/i.test(detail);

  if (detail.includes("PADDLE_KEY_ENV_MISMATCH")) {
    return {
      status: 502,
      body: {
        error:
          "Coolify tiene PADDLE_ENV=live pero la API key es de sandbox. En Environment pon la PADDLE_API_KEY live (pdl_live_…), no la de prueba.",
      },
    };
  }
  if (notReady) {
    return {
      status: 409,
      body: { error: "Paddle aún está generando el PDF. Espera un minuto y reintenta." },
    };
  }
  if (api?.code === "invalid_url" || api?.status === 404 || /404/.test(detail)) {
    const mode = getPaddleMode();
    return {
      status: 409,
      body: {
        error:
          mode === "sandbox"
            ? "Este cobro es de Paddle live y el servidor está en sandbox. En Coolify pon PADDLE_ENV=live y la API key live."
            : "Paddle live no tiene PDF para este cobro. Revisa que PADDLE_API_KEY sea la live, o abre el PDF del correo de Paddle.",
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
  organizationId?: string,
  disposition: "inline" | "attachment" = "attachment"
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

  const txnId = String(invoice.paddle_transaction_id).trim();

  try {
    const url = await getPaddleInvoicePdfUrl(txnId, disposition);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing:invoice-pdf]", getPaddleMode(), txnId, err);
    const mapped = paddleErrorMessage(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
