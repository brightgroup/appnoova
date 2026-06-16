-- Agregar columnas para subcuentas de Twilio en canales de WhatsApp
alter table public.whatsapp_channels
  add column if not exists twilio_subaccount_sid text,
  add column if not exists twilio_subaccount_auth_token text;

-- Tabla de solicitudes de líneas WhatsApp (siguiendo el patrón de phone_line_requests)
create table if not exists public.whatsapp_line_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  text_agent_id   uuid references public.text_agents(id) on delete set null,
  phone_e164      text, -- Opcional: el cliente puede sugerir el número que ya tiene
  friendly_name   text,
  notes           text,
  status          text not null default 'pending', -- pending, approved, rejected, completed
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices
create index if not exists whatsapp_line_requests_user_idx
  on public.whatsapp_line_requests (user_id, status, created_at desc);

-- RLS
alter table public.whatsapp_line_requests enable row level security;

drop policy if exists "whatsapp_line_requests_select_own" on public.whatsapp_line_requests;
create policy "whatsapp_line_requests_select_own" on public.whatsapp_line_requests
  for select using (auth.uid() = user_id);

drop policy if exists "whatsapp_line_requests_insert_own" on public.whatsapp_line_requests;
create policy "whatsapp_line_requests_insert_own" on public.whatsapp_line_requests
  for insert with check (auth.uid() = user_id);
