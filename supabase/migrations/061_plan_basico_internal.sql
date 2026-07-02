-- Plan Básico USD 50 — solo asignación admin (no landing, is_public = false).

insert into public.plans (
  id,
  name,
  price_usd,
  monthly_credits,
  trial_days,
  whatsapp_included,
  max_text_agents,
  max_users,
  support_level,
  sort_order,
  features,
  is_active,
  is_system,
  is_public
) values (
  'basico',
  'Básico',
  50,
  166667,
  0,
  true,
  null,
  1,
  'email',
  15,
  '{"crm_ai": true, "internal_only": true}'::jsonb,
  true,
  false,
  false
)
on conflict (id) do update set
  name              = excluded.name,
  price_usd         = excluded.price_usd,
  monthly_credits   = excluded.monthly_credits,
  trial_days        = excluded.trial_days,
  whatsapp_included = excluded.whatsapp_included,
  max_text_agents   = excluded.max_text_agents,
  max_users         = excluded.max_users,
  support_level     = excluded.support_level,
  sort_order        = excluded.sort_order,
  features          = excluded.features,
  is_active         = excluded.is_active,
  is_system         = excluded.is_system,
  is_public         = excluded.is_public,
  updated_at        = now();

comment on column public.plans.features is 'JSON: crm_ai, internal_only, etc.';
