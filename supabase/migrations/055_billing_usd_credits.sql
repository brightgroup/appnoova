-- Créditos anclados en USD (1 crédito = credit_usd_value USD).
-- COP/TRM queda solo como referencia visual; price_usd es la fuente de verdad en unit_prices.

alter table public.billing_unit_prices
  add column if not exists price_usd numeric(14, 8);

insert into public.billing_settings (key, value)
values ('credit_usd_value', '0.0003'::jsonb)
on conflict (key) do nothing;

-- Precio USD por unidad = créditos COP históricos / TRM vigente
update public.billing_unit_prices u
set price_usd = round((u.credits_cop / nullif(
  (select (bs.value::text)::numeric from public.billing_settings bs where bs.key = 'trm_cop'),
  0
))::numeric, 8)
where u.price_usd is null;

update public.billing_unit_prices
set price_usd = 0.00001
where price_usd is null or price_usd <= 0;

alter table public.billing_unit_prices
  alter column price_usd set not null;

-- Recalibrar saldos: antes 1 crédito ≈ 1 COP; ahora 1 crédito = credit_usd_value USD
do $$
declare
  v_trm numeric;
  v_credit_usd numeric := 0.0003;
  v_factor numeric;
begin
  if exists (
    select 1 from public.billing_settings
    where key = 'credits_usd_migrated' and (value::text)::boolean is true
  ) then
    return;
  end if;

  select (value::text)::numeric into v_trm
  from public.billing_settings where key = 'trm_cop';

  if v_trm is null or v_trm <= 0 then
    v_trm := 4200;
  end if;

  v_factor := 1.0 / (v_trm * v_credit_usd);

  update public.plans
  set monthly_credits = greatest(0, round(monthly_credits * v_factor));

  update public.organization_subscriptions
  set monthly_credits = greatest(0, round(monthly_credits * v_factor));

  update public.organization_credit_wallets
  set
    included_credits = greatest(0, round(included_credits * v_factor)),
    used_credits = greatest(0, round(used_credits * v_factor)),
    topup_credits = greatest(0, round(topup_credits * v_factor));

  -- credits_cop de referencia (visualización COP)
  update public.billing_unit_prices u
  set credits_cop = round(u.price_usd * v_trm, 2);

  insert into public.billing_settings (key, value)
  values ('credits_usd_migrated', 'true'::jsonb)
  on conflict (key) do update set value = 'true'::jsonb, updated_at = now();
end $$;
