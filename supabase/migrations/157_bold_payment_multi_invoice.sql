-- Un solo link de pago Bold que salda VARIAS facturas a la vez ("Pagar" en el
-- aviso de facturas pendientes cobra el total). `invoice_id` se conserva para
-- el pago de una sola factura; `invoice_ids` lista todas las que cubre el
-- cobro (incluye el caso de una sola).

alter table public.bold_payment_requests
  add column if not exists invoice_ids uuid[];

-- Un mismo pago Bold puede saldar varias facturas → deja de ser único por
-- factura. La idempotencia del webhook ya vive en bold_payment_requests
-- (status='paid' + bold_transaction_id), no en este índice.
drop index if exists public.billing_invoices_bold_txn_idx;
create index if not exists billing_invoices_bold_txn_idx
  on public.billing_invoices (bold_transaction_id)
  where bold_transaction_id is not null;
