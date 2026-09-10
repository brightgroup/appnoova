/**
 * Prueba local del PDF de Paddle (sin Coolify).
 * Uso: npx tsx --env-file=.env.local scripts/test-paddle-invoice-pdf.ts
 * No imprime secretos ni IDs completos.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { adminClient } from "../src/lib/voice-agents-server";
import {
  getPaddleInvoicePdfUrl,
  getPaddleTransaction,
  paddleFetch,
  type PaddleTransaction,
} from "../src/lib/billing/paddle/client";

function mask(id: string | null | undefined): string {
  if (!id) return "(none)";
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

async function downloadPdf(txnId: string): Promise<void> {
  const txn = await getPaddleTransaction(txnId);
  console.log("txn_status", txn.status, "has_customer", Boolean(txn.customer_id));

  const paddleUrl = await getPaddleInvoicePdfUrl(txnId, "attachment");
  console.log("got_signed_url", paddleUrl.startsWith("https://"));

  const pdfRes = await fetch(paddleUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  console.log("pdf_http", pdfRes.status, "content_type", pdfRes.headers.get("content-type"));
  const bytes = Buffer.from(await pdfRes.arrayBuffer());
  console.log("pdf_bytes", bytes.byteLength, "pdf_magic", bytes.subarray(0, 4).toString("latin1"));
  if (!pdfRes.ok || bytes.byteLength < 80 || !bytes.subarray(0, 4).toString("latin1").startsWith("%PDF")) {
    throw new Error("PDF download failed");
  }

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "factura-paddle-test.pdf");
  writeFileSync(outPath, bytes);
  console.log("saved", "tmp/factura-paddle-test.pdf");
}

async function main() {
  const db = adminClient();
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "c-market-solutions")
    .maybeSingle();

  if (org) {
    const { data: invoices } = await db
      .from("billing_invoices")
      .select("id, status, paddle_transaction_id")
      .eq("organization_id", org.id)
      .eq("status", "paid")
      .not("paddle_transaction_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const invoice = invoices?.[0];
    if (invoice?.paddle_transaction_id) {
      console.log("trying_org_invoice", mask(invoice.id), "txn", mask(String(invoice.paddle_transaction_id)));
      try {
        await downloadPdf(String(invoice.paddle_transaction_id));
        return;
      } catch (err) {
        console.log(
          "org_invoice_skipped",
          err instanceof Error ? err.message : err,
          "(sandbox key cannot read a live txn — falling back to sandbox completed txn)"
        );
      }
    }
  }

  const listed = await paddleFetch<PaddleTransaction[]>(
    "/transactions?status=completed&per_page=5"
  );
  const txn = listed?.[0];
  if (!txn?.id) throw new Error("no completed sandbox transactions to test");
  console.log("fallback_sandbox_txn", mask(txn.id));
  await downloadPdf(txn.id);
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
