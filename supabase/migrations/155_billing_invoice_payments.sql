-- Pago de una factura puntual (en vez de "pagar el plan").
--
-- Hasta ahora el único cobro en línea era "pagar el plan": abre un periodo
-- nuevo y crea su propia factura pagada, pero no salda facturas previas que
-- sigan pendientes/vencidas. Esto agrega:
--   * `billing_invoices.description` — concepto visible para el cliente
--     (p. ej. "Saldo pendiente periodo 25-jul → 25-ago").
--   * `billing_invoices.currency` — moneda en la que se factura. En 'COP' el
--     monto a cobrar es `amount_cop` exacto (Bold cobra en pesos, sin
--     conversión); 'USD' conserva el comportamiento de siempre.
--   * `bold_payment_requests.kind = 'invoice'` — link Bold ligado a UNA factura.
--   * `billing_record_invoice_payment` — marca esa factura pagada sin tocar el
--     periodo de la suscripción, y solo reactiva la cuenta cuando ya no queda
--     ninguna otra factura pendiente o vencida.

alter table public.billing_invoices
  add column if not exists description text,
  add column if not exists currency text not null default 'USD';

alter table public.billing_invoices
  drop constraint if exists billing_invoices_currency_check;
alter table public.billing_invoices
  add constraint billing_invoices_currency_check check (currency in ('USD', 'COP'));

alter table public.bold_payment_requests
  drop constraint if exists bold_payment_requests_kind_check;
alter table public.bold_payment_requests
  add constraint bold_payment_requests_kind_check check (kind in ('plan', 'topup', 'invoice'));

create or replace function public.billing_record_invoice_payment(
  p_invoice             uuid,
  p_amount_cop          numeric,
  p_amount_usd          numeric,
  p_bold_transaction_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.billing_invoices%rowtype;
  v_remaining int;
begin
  select * into v_inv from public.billing_invoices where id = p_invoice for update;
  if not found then
    raise exception 'Factura % no existe', p_invoice;
  end if;

  if v_inv.status = 'paid' then
    return jsonb_build_object('already_paid', true, 'organization_id', v_inv.organization_id);
  end if;

  update public.billing_invoices
    set status = 'paid',
        paid_at = now(),
        bold_transaction_id = p_bold_transaction_id,
        amount_cop = coalesce(nullif(p_amount_cop, 0), amount_cop),
        updated_at = now()
  where id = p_invoice;

  select count(*) into v_remaining
  from public.billing_invoices
  where organization_id = v_inv.organization_id
    and status in ('pending', 'overdue');

  -- Al día con todas sus facturas: levantar la suspensión por mora. No se
  -- toca el periodo — la factura pagada ya trae el suyo.
  if v_remaining = 0 then
    update public.organization_subscriptions
      set status = case when status in ('suspended', 'past_due') then 'active' else status end,
          past_due_since = null,
          updated_at = now()
    where organization_id = v_inv.organization_id;

    update public.organizations
      set status = 'active', updated_at = now()
    where id = v_inv.organization_id and status = 'suspended';
  end if;

  return jsonb_build_object(
    'already_paid', false,
    'organization_id', v_inv.organization_id,
    'remaining_unpaid', v_remaining
  );
end;
$$;

revoke all on function public.billing_record_invoice_payment(uuid, numeric, numeric, text) from public, anon, authenticated;
