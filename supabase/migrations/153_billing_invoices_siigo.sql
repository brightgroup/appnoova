-- Rastreo de la factura electrónica DIAN emitida en Siigo para cada pago
-- (best-effort: nunca bloquea el pago ni la activación del plan — ver
-- src/lib/billing/siigo/invoice.ts, llamado desde los webhooks de Bold y
-- Paddle envuelto en try/catch).

alter table public.billing_invoices
  add column if not exists siigo_invoice_id text,
  add column if not exists siigo_invoice_number text,
  add column if not exists siigo_invoice_url text,
  add column if not exists siigo_invoice_error text;
