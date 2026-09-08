-- Plan negociado a la medida para Newbody: mismos créditos que "escala" pero
-- precio acordado en COP (2.800.000/mes), no en el catálogo público. El
-- `paddle_price_id_live` queda null hasta crear el precio en Paddle (ver
-- instrucciones en la conversación) — sin eso, el checkout responde 422
-- "no tiene precio configurado".

insert into public.plans (
  id, name, price_usd, monthly_credits, trial_days, whatsapp_included,
  support_level, sort_order, is_active, features, max_users, is_system,
  is_public, max_links
)
values (
  'escala_newbody', 'Escala', 666.67, 3688916, 0, true,
  'dedicated', 40, true, '{"crm_ai": true}'::jsonb, null, false,
  false, 10
)
on conflict (id) do update set
  monthly_credits = excluded.monthly_credits,
  price_usd        = excluded.price_usd,
  updated_at       = now();

update public.organization_subscriptions
  set plan_id = 'escala_newbody',
      price_usd = 666.67,
      monthly_credits = 3688916,
      current_period_end = '2026-09-25T05:00:00Z',
      updated_at = now()
where organization_id = '80aa2287-3fd9-4917-ba03-32204a510807';

update public.organization_credit_wallets
  set included_credits = 3688916,
      period_end = '2026-09-25T05:00:00Z',
      updated_at = now()
where organization_id = '80aa2287-3fd9-4917-ba03-32204a510807';
