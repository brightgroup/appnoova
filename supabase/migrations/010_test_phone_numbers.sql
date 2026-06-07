-- Números de teléfono del usuario para probar agentes (desde los que llama)
create table if not exists public.test_phone_numbers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null default 'Mi celular',
  e164        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists test_phone_numbers_user_e164_idx
  on public.test_phone_numbers (user_id, e164);

create index if not exists test_phone_numbers_user_idx
  on public.test_phone_numbers (user_id);

alter table public.test_phone_numbers enable row level security;

drop policy if exists "test_phone_numbers_select_own" on public.test_phone_numbers;
create policy "test_phone_numbers_select_own" on public.test_phone_numbers
  for select using (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_insert_own" on public.test_phone_numbers;
create policy "test_phone_numbers_insert_own" on public.test_phone_numbers
  for insert with check (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_update_own" on public.test_phone_numbers;
create policy "test_phone_numbers_update_own" on public.test_phone_numbers
  for update using (auth.uid() = user_id);

drop policy if exists "test_phone_numbers_delete_own" on public.test_phone_numbers;
create policy "test_phone_numbers_delete_own" on public.test_phone_numbers
  for delete using (auth.uid() = user_id);
