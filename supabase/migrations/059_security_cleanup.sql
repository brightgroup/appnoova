-- Limpieza de seguridad: eliminar tablas legacy sin uso y cerrar tablas expuestas sin RLS.

-- ── 1. Tablas huérfanas (no están en migraciones Noova; 0 filas) ─────────────
drop table if exists public.calls cascade;
drop table if exists public.companies cascade;
drop table if exists public.clients cascade;
drop table if exists public.templates cascade;

-- ── 2. Tablas solo servidor (service role bypass RLS) ───────────────────────
alter table public.whatsapp_inbound_dedup enable row level security;

alter table public.schema_migrations enable row level security;

-- ── 3. public.users legacy — estaba abierta con anon/authenticated ───────────
alter table public.users enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Inserts/deletes: solo service role (sin política = denegado para JWT).
