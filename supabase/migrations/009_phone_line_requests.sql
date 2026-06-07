-- Solicitudes de clientes: comprar línea Noova o verificar número propio (outbound)
create table if not exists public.phone_line_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  voice_agent_id  uuid references public.voice_agents(id) on delete set null,
  request_type    text not null,
  phone_e164      text,
  country_code    text,
  notes           text,
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists phone_line_requests_user_idx
  on public.phone_line_requests (user_id, status, created_at desc);

alter table public.phone_line_requests enable row level security;

drop policy if exists "phone_line_requests_select_own" on public.phone_line_requests;
drop policy if exists "phone_line_requests_insert_own" on public.phone_line_requests;

create policy "phone_line_requests_select_own" on public.phone_line_requests
  for select using (auth.uid() = user_id);

create policy "phone_line_requests_insert_own" on public.phone_line_requests
  for insert with check (auth.uid() = user_id);
