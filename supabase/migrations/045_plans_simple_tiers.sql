-- Escalera simple: tamaño (usuarios) + volumen (créditos).
-- Esencial 5 · Crecimiento 15 · Escala ilimitado. CRM IA en todos los planes de pago.

insert into public.plans (
  id, name, price_usd, monthly_credits, trial_days, whatsapp_included,
  max_text_agents, max_users, support_level, sort_order, features
) values
  ('explorador',  'Explorador',  0,    15000,   14, false, 1,    1,    'email',      10, '{"crm_ai": false}'::jsonb),
  ('esencial',    'Esencial',    82,   350000,  0,  true,  null, 5,    'email',      20, '{"crm_ai": true}'::jsonb),
  ('crecimiento', 'Crecimiento', 345,  1500000, 0,  true,  null, 15,   'priority',   30, '{"crm_ai": true}'::jsonb),
  ('escala',      'Escala',      815,  3800000, 0,  true,  null, null, 'dedicated',  40, '{"crm_ai": true}'::jsonb)
on conflict (id) do update set
  max_users         = excluded.max_users,
  features          = excluded.features,
  updated_at        = now();
