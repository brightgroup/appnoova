-- Configuración centralizada de precios al cliente y costos de proveedor.

create table if not exists public.billing_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.billing_unit_prices (
  event_type    text primary key,
  label         text not null,
  description   text,
  unit_label    text not null default 'por unidad',
  category      text not null default 'general',
  credits_cop   numeric(12,2) not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

create table if not exists public.billing_provider_rates (
  rate_key      text primary key,
  provider      text not null,
  label         text not null,
  description   text,
  unit_label    text not null default 'por unidad',
  cost_usd      numeric(14,8) not null,
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.plans
  add column if not exists is_system boolean not null default false;

update public.plans
  set is_system = true
  where id in ('explorador', 'esencial', 'crecimiento', 'escala');

-- TRM
insert into public.billing_settings (key, value)
values ('trm_cop', '4200'::jsonb)
on conflict (key) do nothing;

-- Precios al cliente (créditos = COP)
insert into public.billing_unit_prices
  (event_type, label, description, unit_label, category, credits_cop, sort_order)
values
  ('ori', 'ORI', 'Copiloto interno — mensaje pregunta + respuesta', 'por mensaje', 'ori', 10, 10),
  ('milink', 'Mi Link', 'Chat web del visitante en micrositio', 'por mensaje', 'milink', 20, 20),
  ('widget', 'Widget web', 'Chat embebido en sitio del cliente', 'por mensaje', 'milink', 20, 21),
  ('text_test', 'Prueba de agente', 'Mensaje de prueba en editor de agente', 'por mensaje', 'milink', 10, 22),
  ('whatsapp_ai', 'WhatsApp con IA', 'Turno completo: cliente escribe + IA responde', 'por turno', 'whatsapp', 60, 30),
  ('whatsapp_manual', 'WhatsApp manual', 'Mensaje entrante o saliente sin IA', 'por mensaje', 'whatsapp', 30, 31),
  ('voice', 'Voz estándar', 'Agente de voz Gemini Live + Telnyx', 'por minuto', 'voice', 900, 40),
  ('voice_premium', 'Voz premium', 'Agente ElevenLabs + Telnyx', 'por minuto', 'voice', 1200, 41),
  ('doc_scan', 'Escaneo de documento', 'Lectura / extracción con IA', 'por documento', 'documents', 90, 50),
  ('form_fill', 'Llenado de formulario', 'Completar formulario con IA', 'por formulario', 'documents', 50, 51),
  ('quote', 'Cotización', 'Generación de cotización con IA', 'por cotización', 'documents', 70, 52)
on conflict (event_type) do update set
  label = excluded.label,
  description = excluded.description,
  unit_label = excluded.unit_label,
  category = excluded.category,
  sort_order = excluded.sort_order;

-- Costos reales de proveedor (USD)
insert into public.billing_provider_rates
  (rate_key, provider, label, description, unit_label, cost_usd, sort_order)
values
  ('twilio_wa_per_msg', 'twilio', 'Twilio WhatsApp', 'Cada mensaje entrante o saliente', 'por mensaje', 0.005, 10),
  ('voice_standard_per_min', 'telnyx', 'Voz estándar (Telnyx + Gemini)', 'Minuto de llamada con agente IA estándar', 'por minuto', 0.05, 20),
  ('voice_premium_per_min', 'elevenlabs', 'Voz premium (ElevenLabs)', 'Minuto de llamada con agente ElevenLabs', 'por minuto', 0.12, 21),
  ('gemini_flash_input_per_m', 'google', 'Gemini Flash — entrada', 'Tokens de entrada por millón', 'por millón tokens', 0.30, 30),
  ('gemini_flash_output_per_m', 'google', 'Gemini Flash — salida', 'Tokens de salida por millón', 'por millón tokens', 2.50, 31),
  ('gemini_pro_input_per_m', 'google', 'Gemini Pro — entrada', 'Tokens de entrada por millón', 'por millón tokens', 1.25, 32),
  ('gemini_pro_output_per_m', 'google', 'Gemini Pro — salida', 'Tokens de salida por millón', 'por millón tokens', 10.00, 33)
on conflict (rate_key) do update set
  provider = excluded.provider,
  label = excluded.label,
  description = excluded.description,
  unit_label = excluded.unit_label,
  sort_order = excluded.sort_order;

-- RLS: solo service role / superadmin vía API
alter table public.billing_settings enable row level security;
alter table public.billing_unit_prices enable row level security;
alter table public.billing_provider_rates enable row level security;

drop policy if exists billing_settings_service on public.billing_settings;
create policy billing_settings_service on public.billing_settings
  for all using (false);

drop policy if exists billing_unit_prices_service on public.billing_unit_prices;
create policy billing_unit_prices_service on public.billing_unit_prices
  for all using (false);

drop policy if exists billing_provider_rates_service on public.billing_provider_rates;
create policy billing_provider_rates_service on public.billing_provider_rates
  for all using (false);
