-- Widget web totalmente independiente de Mi Link (broker_microsites)

alter table public.broker_web_widgets
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists slug text;

-- Copiar dueño y slug desde el micrositio (migración desde modelo acoplado)
update public.broker_web_widgets w
set
  user_id = m.user_id,
  slug = m.slug
from public.broker_microsites m
where w.microsite_id = m.id
  and (w.user_id is null or w.slug is null);

-- Quitar filas huérfanas sin poder migrar
delete from public.broker_web_widgets where user_id is null or slug is null;

alter table public.broker_web_widgets
  alter column user_id set not null,
  alter column slug set not null;

create unique index if not exists broker_web_widgets_user_id_unique_idx
  on public.broker_web_widgets (user_id);

create unique index if not exists broker_web_widgets_slug_unique_idx
  on public.broker_web_widgets (slug);

-- Políticas RLS antiguas referencian microsite_id: eliminar antes de quitar la columna
drop policy if exists "broker_web_widgets_select_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_insert_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_update_own" on public.broker_web_widgets;
drop policy if exists "broker_web_widgets_delete_own" on public.broker_web_widgets;

drop index if exists broker_web_widgets_microsite_id_idx;

alter table public.broker_web_widgets
  drop constraint if exists broker_web_widgets_microsite_id_fkey;

alter table public.broker_web_widgets
  drop constraint if exists broker_web_widgets_microsite_id_key;

alter table public.broker_web_widgets
  drop column if exists microsite_id;

create policy "broker_web_widgets_select_own" on public.broker_web_widgets
  for select using (auth.uid() = user_id);

create policy "broker_web_widgets_insert_own" on public.broker_web_widgets
  for insert with check (auth.uid() = user_id);

create policy "broker_web_widgets_update_own" on public.broker_web_widgets
  for update using (auth.uid() = user_id);

create policy "broker_web_widgets_delete_own" on public.broker_web_widgets
  for delete using (auth.uid() = user_id);
